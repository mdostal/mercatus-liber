/**
 * acct-02: proves a demo customer's completed checkout shows up in their
 * order history, and that a paid notification shows up in recent activity --
 * the two things the account/dashboard page renders.
 */
import { createAccountService, createInMemoryCustomerProfileRepository } from "@mercatus-liber/account";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("account dashboard data", () => {
  it("shows a completed checkout in order history, and a paid notification in recent activity", async () => {
    const { events, catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

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
    const account = createAccountService({
      profiles: createInMemoryCustomerProfileRepository(),
      orders: checkout, // structurally satisfies OrderLookup -- same wiring as lib/services.ts
      events,
    });

    const profile = await account.createProfile({ email: "demo@example.com", name: "Demo Shopper" });
    const tote = await catalog.getProductBySlug("embroidered-canvas-tote");
    const skus = await catalog.listSkusByProduct(tote!.id);

    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, skus[0]!.id, 1);
    const { order } = await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "Demo Shopper", email: "demo@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: profile.id,
    });

    // Order history
    const orderHistory = await account.listOrders(profile.id);
    expect(orderHistory).toEqual([{ id: order.id, status: "pending_payment", itemCount: 1 }]);

    // Simulate payment confirmation (same pattern as test/integration.test.ts)
    await events.publish("payments.payment.succeeded", { sessionId: `sess_${order.id}`, orderRef: order.id });

    const activity = await account.listRecentActivity(profile.id);
    expect(activity).toEqual([{ orderId: order.id, status: "paid", at: expect.any(String) }]);
    expect((await account.listOrders(profile.id))[0]?.status).toBe("paid");
  });
});
