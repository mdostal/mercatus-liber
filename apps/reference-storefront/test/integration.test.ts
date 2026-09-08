/**
 * Full core-foundation vertical-slice proof: seed -> browse -> add to cart ->
 * checkout -> payment confirmed -> order paid. Runs against the same wiring
 * shape as lib/services.ts, but with a fake payments adapter instead of the
 * real Stripe adapter -- no live Stripe test-mode key exists for this project
 * yet (see cf-05's execution_note), so this stays deterministic/offline rather
 * than making real network calls with an empty key. A literal browser-driven
 * Playwright test against a live `next dev` server + real Stripe test mode is
 * the natural follow-up once a key is dropped (see cf-07's execution_note).
 */
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCatalogService } from "@mercatus-liber/catalog";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { describe, expect, it, vi } from "vitest";
import { seedCatalog } from "../lib/seed.js";

describe("core-foundation vertical slice (seed -> browse -> cart -> checkout -> paid)", () => {
  it("takes a shopper from browsing the seeded catalog to a paid order", async () => {
    const events = createInMemoryEventBus();

    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog,
    });
    await seedCatalog(catalog, marketingCatalog);

    const cart = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events,
    });

    const createPaymentSession = vi.fn(async (input: { orderRef: string }) => ({
      sessionId: `sess_${input.orderRef}`,
      redirectUrl: `https://checkout.example/${input.orderRef}`,
    }));

    const checkout = createCheckoutOrdersService({
      repository: createInMemoryOrderRepository(),
      cart,
      payments: { createPaymentSession },
      events,
    });

    // Browse
    const products = await catalog.listProducts({ status: "active" });
    expect(products.length).toBeGreaterThanOrEqual(2);
    const product = products[0];
    if (!product) throw new Error("expected at least one seeded product");
    const skus = await catalog.listSkusByProduct(product.id);
    const sku = skus[0];
    if (!sku) throw new Error("expected at least one seeded SKU");

    // Add to cart
    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, sku.id, 2);
    const cartAfterAdd = await cart.getCart(shopperCart.id);
    expect(cartAfterAdd?.items).toEqual([{ skuId: sku.id, quantity: 2, priceSnapshot: sku.price }]);

    // Checkout
    const { order, redirectUrl } = await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "Demo Shopper", email: "demo@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });
    expect(order.status).toBe("pending_payment");
    expect(redirectUrl).toBe(`https://checkout.example/${order.id}`);
    expect(createPaymentSession).toHaveBeenCalledTimes(1);

    // Simulate the payment provider confirming payment (what a verified Stripe
    // webhook -> payments.payment.succeeded would do in production)
    await events.publish("payments.payment.succeeded", { sessionId: `sess_${order.id}`, orderRef: order.id });

    const finalOrder = await checkout.getOrder(order.id);
    expect(finalOrder?.status).toBe("paid");
  });
});
