/**
 * Proves the claim made by docs/subsystems/17-bundles.md and
 * .pHive/epics/bundles/docs/design-discussion.md: an admin can discount a
 * bundle tier today via a product-scope promotion targeting that tier's
 * skuIds, with zero code changes to either package. Nothing in this repo
 * exercised that composition before this test (see
 * .pHive/epics/commerce-gap-audit-2/docs/audit-findings.md, finding #4).
 *
 * Wiring mirrors lib/services.ts's real DI shape: bundles/promotions/cart/
 * checkout-orders are all wired against the SAME real catalog (bundles'
 * SkuPriceLookup and cart's sku lookup both resolve through `catalog`), and
 * checkout's PricingAdjuster is `promotions.evaluate` adapted to
 * PricingAdjustment exactly as lib/services.ts does it -- not a mock.
 */
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryPromotionRepository, createPromotionsService } from "@mercatus-liber/promotions";
import { describe, expect, it } from "vitest";
import { buildTestCatalogServices } from "./helpers.js";

describe("bundles + promotions composition (checkout-orders' previewCheckout)", () => {
  it("discounts only the bundle tier's targeted SKU line, leaving the tier's other SKU at full price", async () => {
    const { events, catalog } = buildTestCatalogServices();

    // One product, two SKUs -- the bundle tier's full "add these SKUs to
    // cart" set (per BundleTier.skuIds' doc comment).
    const product = await catalog.createProduct({
      slug: "test-combo",
      title: "Test Combo",
      description: "A product with two SKUs used as a bundle tier.",
      identifyingAttributeKeys: ["variant"],
    });
    const skuX = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "variant", value: "x" }],
      price: { amount: 10000, currency: "USD" }, // $100.00
    });
    const skuY = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "variant", value: "y" }],
      price: { amount: 5000, currency: "USD" }, // $50.00
    });

    // Bundle: one tier bundling skuX + skuY together.
    const bundles = createBundlesService({
      repository: createInMemoryBundleRepository(),
      skuLookup: catalog,
    });
    const bundle = await bundles.createBundle({
      productId: product.id,
      title: "Test Combo Bundle",
      tiers: [{ id: "tier-1", label: "Both items", skuIds: [skuX.id, skuY.id] }],
    });

    // Promotion: 10% off, product-scope, targeting ONLY skuX -- skuY must
    // come out of checkout untouched, proving the discount is applied
    // per-line, not to the whole bundle/cart.
    const promotions = createPromotionsService({
      repository: createInMemoryPromotionRepository(),
      events,
    });
    await promotions.createPromotion({
      code: null, // auto-applied, no coupon code needed at checkout
      kind: "percentage",
      scope: "product",
      value: 10,
      currency: "USD",
      targetSkuIds: [skuX.id],
      minCartAmount: null,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
    });

    // Cart: resolve the tier's SKUs the same way the real
    // addBundleTierToCartAction does (lib/actions.ts) -- get the bundle,
    // find the tier, add one of each of its skuIds -- not a hardcoded list.
    const cart = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events,
    });
    const shopperCart = await cart.createCart();
    const resolvedBundle = await bundles.getBundle(bundle.id);
    const tier = resolvedBundle?.tiers.find((t) => t.id === "tier-1");
    if (!tier) throw new Error("expected tier-1 to resolve");
    for (const skuId of tier.skuIds) {
      await cart.addItem(shopperCart.id, skuId, 1);
    }

    // Checkout, wired with promotions as its PricingAdjuster -- the exact
    // structural adaptation lib/services.ts uses in production (evaluate()'s
    // richer PromotionEvaluation narrowed down to PricingAdjustment's shape).
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
      pricing: {
        async computeAdjustment(input) {
          const evaluation = await promotions.evaluate(input);
          return {
            items: evaluation.items,
            discountTotal: evaluation.discountTotal,
            total: evaluation.total,
            appliedCode: evaluation.appliedCode,
          };
        },
      },
    });

    const preview = await checkout.previewCheckout({ cartId: shopperCart.id });

    const discountedLine = preview.items.find((item) => item.skuId === skuX.id);
    const untouchedLine = preview.items.find((item) => item.skuId === skuY.id);

    // skuX: $100.00 - 10% = $90.00 -- the promotion's discount landed on
    // exactly the SKU it targets.
    expect(discountedLine?.unitAmount).toEqual({ amount: 9000, currency: "USD" });
    // skuY: untouched by a promotion that never named it.
    expect(untouchedLine?.unitAmount).toEqual({ amount: 5000, currency: "USD" });

    // Cart-level total: $150.00 subtotal - $10.00 discount = $140.00.
    expect(preview.discountTotal).toEqual({ amount: 1000, currency: "USD" });
    expect(preview.total).toEqual({ amount: 14000, currency: "USD" });
  });
});
