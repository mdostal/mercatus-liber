import type { Bundle, TierPricing } from "@mercatus-liber/bundles";
import { addBundleTierToCartAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";
import { InteractionTracker } from "./interaction-tracker";

/**
 * Renders one <form> per Bundle tier -- the multi-SKU sibling of the
 * per-SKU add-to-cart forms in pdp-tabbed-detail.tsx/pdp-long-scroll.tsx,
 * same styling convention. Composed onto the product page at the app layer
 * (see app/products/[slug]/page.tsx and design-discussion.md §5) instead of
 * (or above) the normal per-SKU forms when a bundle exists for the product.
 * `pricingByTierId` is precomputed by the page (one computeTierPricing call
 * per tier) so this component stays a pure render -- no data fetching here.
 *
 * `activeProductId`/`activeSkuId` (commerce-gap-audit-3 finding #13, see
 * .pHive/epics/commerce-gap-audit-3/docs/bundle-variant-resolution-design.md)
 * carry the PDP's own already-resolved product/variant selection (the same
 * `viewModel.product.id`/`activeSku.id` the page's per-SKU add-to-cart forms
 * already use) as two more hidden fields, so `addBundleTierToCartAction` can
 * resolve a tier's skuIds against the shopper's live variant pick instead of
 * always adding whatever specific SKU was hardcoded at bundle-authoring
 * time. Always passed by the page (harmless for a single-SKU product or a
 * tier with no overlap -- see resolveTierCartSkuIds' own doc comment), never
 * optional here, so no caller can forget to wire this.
 */
export function BundleTierSelector({
  demoSlug,
  bundle,
  pricingByTierId,
  activeProductId,
  activeSkuId,
}: {
  demoSlug: DemoSlug;
  bundle: Bundle;
  pricingByTierId: Record<string, TierPricing>;
  activeProductId: string;
  activeSkuId: string;
}) {
  return (
    <section style={{ marginBottom: "var(--space-sm, 16px)" }}>
      <InteractionTracker eventName="bundle_viewed" properties={{ bundleId: bundle.id, title: bundle.title }} />
      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>{bundle.title}</h2>
      {bundle.tiers.map((tier) => {
        const pricing = pricingByTierId[tier.id];
        return (
          <form
            action={addBundleTierToCartAction}
            key={tier.id}
            style={{
              marginBottom: "var(--space-sm, 16px)",
              borderTop: "1px solid var(--color-border, #e5e5e5)",
              paddingTop: "var(--space-xs, 8px)",
            }}
          >
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="hidden" name="bundleId" value={bundle.id} />
            <input type="hidden" name="tierId" value={tier.id} />
            <input type="hidden" name="activeProductId" value={activeProductId} />
            <input type="hidden" name="activeSkuId" value={activeSkuId} />
            <span style={{ fontSize: "var(--font-size-body, 1rem)" }}>
              {tier.label}
              {pricing ? (
                <span style={{ color: "var(--color-muted, #666)" }}>
                  {" -- "}
                  {(pricing.total.amount / 100).toFixed(2)} {pricing.total.currency}
                </span>
              ) : null}
            </span>{" "}
            <button
              type="submit"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-background)",
                borderRadius: "var(--radius)",
                border: "none",
                padding: "var(--space-xs, 8px) var(--space-sm, 16px)",
              }}
            >
              Add to cart
            </button>
          </form>
        );
      })}
    </section>
  );
}
