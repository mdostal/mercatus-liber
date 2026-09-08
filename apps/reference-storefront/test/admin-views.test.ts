/**
 * admin-02: proves the data each /admin sub-page reads (catalog.listProducts,
 * cms.listPages, checkout.listOrders) is populated exactly the way the pages
 * consume it, wired the same way lib/services.ts wires it -- without needing
 * to render the actual React Server Components.
 */
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("admin views", () => {
  it("admin/catalog: lists every seeded product with id, title, status", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const products = await catalog.listProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.id).toBeTruthy();
      expect(product.title).toBeTruthy();
      expect(product.status).toBeTruthy();
    }
  });

  it("admin/cms: lists every seeded page with id, title, pageType, status", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    const pages = await cms.listPages();
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.id).toBeTruthy();
      expect(page.title).toBeTruthy();
      expect(page.pageType).toBeTruthy();
      expect(page.status).toBeTruthy();
    }
  });

  it("admin/orders: lists guest and customer orders together, with customerId falling back to 'guest' in the page's own display logic", async () => {
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

    const organizer = await catalog.getProductBySlug("dragon-cable-organizer");
    const skus = await catalog.listSkusByProduct(organizer!.id);

    const guestCart = await cart.createCart();
    await cart.addItem(guestCart.id, skus[0]!.id, 1);
    const { order: guestOrder } = await checkout.startCheckout({
      cartId: guestCart.id,
      idempotencyKey: "admin-test-guest",
      shippingInfo: { name: "Guest", email: "g@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    const custCart = await cart.createCart();
    await cart.addItem(custCart.id, skus[0]!.id, 2);
    const { order: custOrder } = await checkout.startCheckout({
      cartId: custCart.id,
      idempotencyKey: "admin-test-cust",
      shippingInfo: { name: "Cust", email: "c@example.com", address: "2 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-admin-1",
    });

    const orders = await checkout.listOrders();
    const ids = orders.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([guestOrder.id, custOrder.id]));

    const foundGuest = orders.find((o) => o.id === guestOrder.id)!;
    const foundCust = orders.find((o) => o.id === custOrder.id)!;
    expect(foundGuest.customerId ?? "guest").toBe("guest");
    expect(foundCust.customerId ?? "guest").toBe("cust-admin-1");
  });
});
