import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryCartRepository, createCartService, type CartService } from "@mercatus-liber/cart";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryOrderRepository } from "../src/in-memory-repository.js";
import { createCheckoutOrdersService, type CheckoutOrdersService } from "../src/service.js";
import { CartNotFoundForCheckoutError, EmptyCartError } from "../src/types.js";
import type { OrderRepository, PaymentSessionCreator } from "../src/types.js";

describe("checkout-orders service", () => {
  let events: EventBus;
  let catalog: CatalogService;
  let cartService: CartService;
  let checkout: CheckoutOrdersService;
  let orderRepository: OrderRepository;
  let createPaymentSession: ReturnType<typeof vi.fn>;
  const orderPlacedEvents: unknown[] = [];
  const orderPaidEvents: unknown[] = [];
  let activeSkuId: string;
  let cartId: string;

  beforeEach(async () => {
    orderPlacedEvents.length = 0;
    orderPaidEvents.length = 0;
    events = createInMemoryEventBus();
    events.subscribe("checkout.order.placed", async (p) => {
      orderPlacedEvents.push(p);
    });
    events.subscribe("checkout.order.paid", async (p) => {
      orderPaidEvents.push(p);
    });

    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
    const product = await catalog.createProduct({
      slug: "organizer",
      title: "Organizer",
      description: "d",
      identifyingAttributeKeys: ["color"],
    });
    const sku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "red" }],
      price: { amount: 1500, currency: "USD" },
    });
    activeSkuId = sku.id;

    cartService = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events: createInMemoryEventBus(),
    });
    const createdCart = await cartService.createCart();
    cartId = createdCart.id;

    let sessionCounter = 0;
    createPaymentSession = vi.fn(async () => {
      sessionCounter += 1;
      return { sessionId: `sess_${sessionCounter}`, redirectUrl: `https://checkout.example/${sessionCounter}` };
    });
    const payments: PaymentSessionCreator = { createPaymentSession };

    orderRepository = createInMemoryOrderRepository();
    checkout = createCheckoutOrdersService({
      repository: orderRepository,
      cart: cartService,
      payments,
      events,
    });
  });

  it("starts checkout for a non-empty cart: creates a pending_payment order, calls payments with line items, and publishes checkout.order.placed", async () => {
    await cartService.addItem(cartId, activeSkuId, 2);

    const result = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-1",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    expect(result.order.status).toBe("pending_payment");
    expect(result.order.items).toEqual([{ skuId: activeSkuId, quantity: 2, priceAtPurchase: { amount: 1500, currency: "USD" } }]);
    expect(result.order.customerId).toBeNull(); // guest checkout -- customerId omitted
    expect(result.redirectUrl).toBe("https://checkout.example/1");
    expect(createPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderRef: result.order.id,
        lineItems: [{ name: `SKU ${activeSkuId}`, unitAmount: { amount: 1500, currency: "USD" }, quantity: 2 }],
      }),
    );
    expect(orderPlacedEvents).toEqual([{ orderId: result.order.id }]);
  });

  it("throws EmptyCartError for a cart with no items", async () => {
    await expect(
      checkout.startCheckout({
        cartId,
        idempotencyKey: "idem-2",
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      }),
    ).rejects.toThrow(EmptyCartError);
  });

  it("throws CartNotFoundForCheckoutError for an unknown cart id", async () => {
    await expect(
      checkout.startCheckout({
        cartId: "missing",
        idempotencyKey: "idem-3",
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      }),
    ).rejects.toThrow(CartNotFoundForCheckoutError);
  });

  it("is idempotent: a retried checkout with the same key returns the same order/redirect without creating a second payment session", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const input = {
      cartId,
      idempotencyKey: "idem-4",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    };
    const first = await checkout.startCheckout(input);
    const second = await checkout.startCheckout(input);

    expect(second.order.id).toBe(first.order.id);
    expect(second.redirectUrl).toBe(first.redirectUrl);
    expect(createPaymentSession).toHaveBeenCalledTimes(1);
  });

  it("transitions an order to paid when payments.payment.succeeded fires for its orderRef, and publishes checkout.order.paid", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-5",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });

    const updated = await checkout.getOrder(order.id);
    expect(updated?.status).toBe("paid");
    expect(orderPaidEvents).toEqual([{ orderId: order.id }]);
  });

  it("is idempotent on a redelivered payment-succeeded event -- only transitions/publishes once", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-6",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });
    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });

    expect(orderPaidEvents).toEqual([{ orderId: order.id }]);
  });

  it("getOrder returns null for an unknown order id", async () => {
    expect(await checkout.getOrder("missing")).toBeNull();
  });

  it("stamps customerId on the order when provided, for account-subsystem lookups", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-7",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-1",
    });
    expect(order.customerId).toBe("cust-1");
  });

  it("repository.listByCustomerId returns only that customer's orders", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order: custOrder } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-8",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-2",
    });
    // A second, guest checkout must not appear in cust-2's results.
    const secondCart = await cartService.createCart();
    await cartService.addItem(secondCart.id, activeSkuId, 1);
    await checkout.startCheckout({
      cartId: secondCart.id,
      idempotencyKey: "idem-9",
      shippingInfo: { name: "B", email: "b@example.com", address: "2 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    const custOrders = await orderRepository.listByCustomerId("cust-2");
    expect(custOrders.map((o) => o.id)).toEqual([custOrder.id]);
  });
});
