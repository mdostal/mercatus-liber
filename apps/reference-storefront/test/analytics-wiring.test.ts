/**
 * analytics-02: proves a real checkout run through the same service graph
 * lib/services.ts wires produces the expected analytics.track() calls, using
 * a recording test double substituted for the adapter -- no real PostHog
 * network calls in tests, same pattern as plugins.test.ts and
 * admin-views.test.ts.
 */
import { registerAnalyticsSync, type AnalyticsAdapter } from "@mercatus-liber/analytics";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

function recordingAdapter(): { adapter: AnalyticsAdapter; calls: { event: string; properties: unknown }[] } {
  const calls: { event: string; properties: unknown }[] = [];
  return {
    calls,
    adapter: {
      async track(eventName, properties) {
        calls.push({ event: eventName, properties });
      },
      async identify() {},
      async page() {},
    },
  };
}

describe("analytics wiring", () => {
  it("a real checkout run produces order_placed and order_paid track() calls in order", async () => {
    const { events, catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const { adapter, calls } = recordingAdapter();
    registerAnalyticsSync({ events, analytics: adapter });

    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events });
    const checkout = createCheckoutOrdersService({
      repository: createInMemoryOrderRepository(),
      cart,
      payments: {
        createPaymentSession: async (input) => ({
          sessionId: `sess_${input.orderRef}`,
          redirectUrl: `https://checkout.example/${input.orderRef}`,
        }),
      },
      events,
    });

    const organizer = await catalog.getProductBySlug("dragon-cable-organizer");
    const skus = await catalog.listSkusByProduct(organizer!.id);
    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, skus[0]!.id, 1);

    const { order } = await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });
    await events.publish("payments.payment.succeeded", { sessionId: "sess-x", orderRef: order.id });

    // cart.item.added and payments.payment.succeeded are also allow-listed,
    // so they show up too -- the full real sequence, not a cherry-picked one.
    expect(calls.map((c) => c.event)).toEqual(["cart_item_added", "order_placed", "payment_succeeded", "order_paid"]);
    const orderPlaced = calls.find((c) => c.event === "order_placed")!;
    const orderPaid = calls.find((c) => c.event === "order_paid")!;
    expect(orderPlaced.properties).toEqual({ orderId: order.id });
    expect(orderPaid.properties).toEqual({ orderId: order.id });
  });
});
