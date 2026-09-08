/**
 * inv-02: proves the seeded stock reflects reality and that placing an order
 * (before payment even confirms) already decreases available stock -- the
 * reserve() half of the reserve/commit/release lifecycle, exercised through
 * a real seed -> browse -> checkout chain.
 */
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryInventoryAdapter, registerInventorySync } from "@mercatus-liber/inventory";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("seeded inventory", () => {
  it("matches the seeded stockUnits for a demo SKU", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const organizer = await catalog.getProductBySlug("dragon-cable-organizer");
    const skus = await catalog.listSkusByProduct(organizer!.id);
    const level = await inventory.getStock(skus[0]!.id);
    expect(level).toEqual({ skuId: skus[0]!.id, onHand: 12, reserved: 0 });
  });

  it("decreases available stock as soon as an order is placed, before payment confirms", async () => {
    // Needs a real checkout-orders instance wired in as inventory's
    // OrderLookup (buildTestCatalogServices defaults to a no-op) -- build
    // the fuller graph directly, same pattern as test/integration.test.ts.
    const { events, catalog, marketingCatalog, cms } = buildTestCatalogServices();

    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events });
    const orderRepository = createInMemoryOrderRepository();
    const checkout = createCheckoutOrdersService({
      repository: orderRepository,
      cart,
      payments: {
        createPaymentSession: async (input) => ({
          sessionId: `sess_${input.orderRef}`,
          redirectUrl: `https://checkout.example/${input.orderRef}`,
        }),
      },
      events,
    });

    const inventory = createInMemoryInventoryAdapter();
    registerInventorySync({ events, inventory, orders: checkout });

    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const organizer = await catalog.getProductBySlug("dragon-cable-organizer");
    const skus = await catalog.listSkusByProduct(organizer!.id);
    const skuId = skus[0]!.id;

    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, skuId, 4);
    await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    const level = await inventory.getStock(skuId);
    expect(level).toEqual({ skuId, onHand: 12, reserved: 4 }); // available = 12 - 4 = 8, before any payment event fires
  });
});
