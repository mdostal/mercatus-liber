/**
 * plug-02: proves the order-notification reference plugin, wired the same
 * way lib/services.ts wires it, actually reacts to a real checkout.
 */
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createOrderNotificationPlugin, createPluginRegistry } from "@mercatus-liber/plugins";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("order-notification plugin wiring", () => {
  it("lists a notification for an order placed through a real checkout", async () => {
    const { events, catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const plugins = createPluginRegistry();
    const orderNotificationPlugin = createOrderNotificationPlugin();
    plugins.register(orderNotificationPlugin);
    await plugins.initAll({ events });

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

    const notifications = orderNotificationPlugin.listNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ orderId: order.id, message: `Order ${order.id} placed` });
  });
});
