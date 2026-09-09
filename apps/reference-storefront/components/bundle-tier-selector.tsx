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
 */
export function BundleTierSelector({
  demoSlug,
  bundle,
  pricingByTierId,
}: {
  demoSlug: DemoSlug;
  bundle: Bundle;
  pricingByTierId: Record<string, TierPricing>;
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
