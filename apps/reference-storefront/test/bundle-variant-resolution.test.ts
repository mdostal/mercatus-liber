/**
 * commerce-gap-audit-3 finding #13 (see
 * .pHive/epics/commerce-gap-audit-3/docs/bundle-variant-resolution-design.md):
 * a bundle tier's skuIds is a fixed list chosen at bundle-creation time,
 * independent of whatever SKU the shopper's variant picker (epic 63,
 * packages/pdp's resolveSelection) currently has selected. This test proves
 * the real fix end to end, wired exactly like lib/actions.ts'
 * addBundleTierToCartAction does in production (real catalog, real bundles
 * service, real cart -- `catalog` doubles as both bundles' SkuPriceLookup
 * and resolveTierCartSkuIds' TierSkuVariantLookup, same "catalog
 * structurally satisfies it" pattern as lib/services.ts).
 */
import { createBundlesService, createInMemoryBundleRepository, resolveTierCartSkuIds } from "@mercatus-liber/bundles";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { describe, expect, it } from "vitest";
import { buildTestCatalogServices } from "./helpers.js";

describe("bundle tier add-to-cart resolves against the PDP's active variant selection", () => {
  it("(a) a single-SKU-per-tier bundle on a single-SKU product adds the same skuId as before, byte-identical", async () => {
    const { catalog, events } = buildTestCatalogServices();

    const product = await catalog.createProduct({
      slug: "single-sku-widget",
      title: "Single SKU Widget",
      description: "A product with exactly one SKU.",
      identifyingAttributeKeys: [],
    });
    const sku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [],
      price: { amount: 2500, currency: "USD" },
    });

    const bundles = createBundlesService({ repository: createInMemoryBundleRepository(), skuLookup: catalog });
    const bundle = await bundles.createBundle({
      productId: product.id,
      title: "Widget Bundle",
      tiers: [{ id: "tier-1", label: "Product Only", skuIds: [sku.id] }],
    });

    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events });
    const shopperCart = await cart.createCart();

    const resolvedBundle = await bundles.getBundle(bundle.id);
    const tier = resolvedBundle?.tiers.find((t) => t.id === "tier-1");
    if (!tier) throw new Error("expected tier-1 to resolve");

    // Exactly what the real addBundleTierToCartAction does: resolve against
    // the PDP's own activeProductId/activeSkuId (here, the PDP's only real
    // SKU -- a single-SKU product's activeSku is always that one SKU).
    const skuIds = await resolveTierCartSkuIds(tier, { productId: product.id, skuId: sku.id }, catalog);
    for (const skuId of skuIds) {
      await cart.addItem(shopperCart.id, skuId, 1);
    }

    const cartState = await cart.getCart(shopperCart.id);
    expect(cartState?.items.map((item) => item.skuId)).toEqual([sku.id]);
  });

  it("(b) a tier pinned to one SKU of a real multi-variant product resolves to the shopper's newly-selected variant, not the originally-hardcoded SKU", async () => {
    const { catalog, events } = buildTestCatalogServices();

    // A real multi-variant product -- 2 real SKUs (color), same shape as
    // embroidered-performance-polo in the live demo seed data.
    const product = await catalog.createProduct({
      slug: "embroidered-tee",
      title: "Embroidered Tee",
      description: "A product with 2 real color SKUs.",
      identifyingAttributeKeys: ["color"],
    });
    const navySku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "navy" }],
      price: { amount: 3000, currency: "USD" },
    });
    const redSku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "red" }],
      price: { amount: 3000, currency: "USD" },
    });

    // Bundle tier authored/hardcoded against the navy SKU at bundle-creation
    // time -- exactly the audit finding's scenario.
    const bundles = createBundlesService({ repository: createInMemoryBundleRepository(), skuLookup: catalog });
    const bundle = await bundles.createBundle({
      productId: product.id,
      title: "Tee Bundle",
      tiers: [{ id: "tier-1", label: "Product Only", skuIds: [navySku.id] }],
    });

    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events });
    const shopperCart = await cart.createCart();

    const resolvedBundle = await bundles.getBundle(bundle.id);
    const tier = resolvedBundle?.tiers.find((t) => t.id === "tier-1");
    if (!tier) throw new Error("expected tier-1 to resolve");

    // The shopper's variant picker on this PDP has resolved to the red SKU
    // (e.g. via pdp.resolveSelection against a ?color=red query param) --
    // NOT the navy SKU the tier was originally authored against.
    const skuIds = await resolveTierCartSkuIds(tier, { productId: product.id, skuId: redSku.id }, catalog);
    for (const skuId of skuIds) {
      await cart.addItem(shopperCart.id, skuId, 1);
    }

    const cartState = await cart.getCart(shopperCart.id);
    // The real fix: the cart line is the shopper's actively-selected red
    // SKU, not the tier's originally-hardcoded navy SKU.
    expect(cartState?.items.map((item) => item.skuId)).toEqual([redSku.id]);
    expect(cartState?.items.map((item) => item.skuId)).not.toContain(navySku.id);
  });
});
