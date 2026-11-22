import { createInMemoryEventBus, type EventBus, type Money } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryOrderRepository } from "../src/in-memory-repository.js";
import { createCheckoutOrdersService, type CheckoutOrdersService } from "../src/service.js";
import type { OrderAbandonedEvent, OrderRepository, PaymentExpiredPayload } from "../src/types.js";

const usd = (amount: number): Money => ({ amount, currency: "USD" });

describe("abandoned checkout", () => {
  let events: EventBus;
  let repository: OrderRepository;
  let checkout: CheckoutOrdersService;
  let abandoned: OrderAbandonedEvent[];
  let paid: unknown[];
  let createPaymentSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = createInMemoryEventBus();
    repository = createInMemoryOrderRepository();
    abandoned = [];
    paid = [];
    events.subscribe<OrderAbandonedEvent>("checkout.order.abandoned", async (e) => void abandoned.push(e));
    events.subscribe("checkout.order.paid", async (e) => void paid.push(e));
    let n = 0;
    createPaymentSession = vi.fn(async () => {
      n += 1;
      return { sessionId: `sess_${n}`, redirectUrl: `https://pay.example/${n}` };
    });
    checkout = createCheckoutOrdersService({
      repository,
      cart: { getCart: async () => ({ items: [{ skuId: "sku-1", quantity: 2, priceSnapshot: usd(1500) }] }) },
      payments: { createPaymentSession },
      events,
    });
  });

  const start = () =>
    checkout.startCheckout({
      cartId: "cart-1",
      idempotencyKey: "cart-1",
      shippingInfo: { name: "Ada", email: "ada@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/ok",
      cancelUrl: "https://shop.example/cancel",
    });

  const expire = (orderRef: string, extra: Partial<PaymentExpiredPayload> = {}) =>
    events.publish<PaymentExpiredPayload>("payments.payment.expired", {
      sessionId: "sess_1",
      orderRef,
      email: "ada@example.com",
      promotionalConsent: true,
      recoveryUrl: "https://pay.example/recover/1",
      recoveryExpiresAt: "2026-12-21T00:00:00.000Z",
      expiredAt: "2026-11-22T00:00:00.000Z",
      ...extra,
    });

  it("marks the order abandoned and publishes checkout.order.abandoned once, remindable with consent", async () => {
    const { order } = await start();
    await expire(order.id);
    await expire(order.id); // a redelivered webhook

    const saved = await repository.get(order.id);
    expect(saved?.status).toBe("abandoned");
    expect(saved?.abandonment).toEqual({
      at: "2026-11-22T00:00:00.000Z",
      email: "ada@example.com",
      promotionalConsent: true,
      recoveryUrl: "https://pay.example/recover/1",
      recoveryExpiresAt: "2026-12-21T00:00:00.000Z",
    });
    expect(abandoned).toEqual([
      { orderId: order.id, email: "ada@example.com", promotionalConsent: true, recoveryUrl: "https://pay.example/recover/1", recoveryExpiresAt: "2026-12-21T00:00:00.000Z", canRemind: true },
    ]);
    expect(await checkout.listOrders({ status: "abandoned" })).toHaveLength(1);
  });

  it("can't remind without consent, an email or a link", async () => {
    const { order } = await start();
    await expire(order.id, { promotionalConsent: false });
    expect(abandoned[0]?.canRemind).toBe(false);
  });

  it("falls back to the email the store was given", async () => {
    const { order } = await start();
    await expire(order.id, { email: null });
    expect(abandoned[0]).toMatchObject({ email: "ada@example.com", canRemind: true });
  });

  it("ignores an expired session that isn't the order's current one, and paid orders", async () => {
    const { order } = await start();
    await expire(order.id, { sessionId: "sess_old" });
    expect((await repository.get(order.id))?.status).toBe("pending_payment");

    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });
    await expire(order.id);
    expect((await repository.get(order.id))?.status).toBe("paid");
    expect(abandoned).toEqual([]);
  });

  it("is paid through the recovery link, by orderRef or by the expired session", async () => {
    const { order } = await start();
    await expire(order.id);
    await events.publish("payments.payment.succeeded", { sessionId: "sess_recovered", orderRef: null, recoveredFromSessionId: "sess_1" });

    const saved = await repository.get(order.id);
    expect(saved?.status).toBe("paid");
    expect(saved?.paymentSessionId).toBe("sess_recovered");
    expect(saved?.abandonment).toBeDefined(); // kept, so recovered orders can be counted
    expect(paid).toEqual([{ orderId: order.id }]);
  });

  it("checking out the same cart again restarts the abandoned order with a new session", async () => {
    const first = await start();
    await expire(first.order.id);

    const again = await start();
    expect(again.order.id).toBe(first.order.id);
    expect(again.order.createdAt).toBe(first.order.createdAt);
    expect(again.order.status).toBe("pending_payment");
    expect(again.order.abandonment).toBeUndefined();
    expect(again.redirectUrl).toBe("https://pay.example/2");
    expect(createPaymentSession).toHaveBeenCalledTimes(2);
    expect(await repository.listAll()).toHaveLength(1);

    // A pending order still returns its live link without a new session.
    expect((await start()).redirectUrl).toBe("https://pay.example/2");
    expect(createPaymentSession).toHaveBeenCalledTimes(2);
  });

  it("records the buyer's marketing consent on the paid order, without the email on the event", async () => {
    const { order } = await start();
    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id, customer: { name: "Ada", email: "buyer@example.com", phone: null }, promotionalConsent: true });
    expect((await repository.get(order.id))?.marketingConsent).toEqual({ promotional: true, email: "buyer@example.com" });
    expect(paid).toEqual([{ orderId: order.id, promotionalConsent: true }]);
  });

  it("leaves consent off when the payment page didn't ask", async () => {
    const { order } = await start();
    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });
    expect(await repository.get(order.id)).not.toHaveProperty("marketingConsent");
    expect(paid).toEqual([{ orderId: order.id }]);
  });
});
