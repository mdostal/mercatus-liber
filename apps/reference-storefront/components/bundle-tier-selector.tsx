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
    <section style={{ marginBottom: 16 }}>
      <InteractionTracker eventName="bundle_viewed" properties={{ bundleId: bundle.id, title: bundle.title }} />
      <h2>{bundle.title}</h2>
      {bundle.tiers.map((tier) => {
        const pricing = pricingByTierId[tier.id];
        return (
          <form
            action={addBundleTierToCartAction}
            key={tier.id}
            style={{ marginBottom: 12, borderTop: "1px solid var(--color-accent)", paddingTop: 8 }}
          >
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="hidden" name="bundleId" value={bundle.id} />
            <input type="hidden" name="tierId" value={tier.id} />
            <span>
              {tier.label}
              {pricing ? (
                <>
                  {" -- "}
                  {(pricing.total.amount / 100).toFixed(2)} {pricing.total.currency}
                </>
              ) : null}
            </span>{" "}
            <button
              type="submit"
              style={{ background: "var(--color-primary)", color: "var(--color-background)", borderRadius: "var(--radius)", border: "none", padding: "4px 12px" }}
            >
              Add to cart
            </button>
          </form>
        );
      })}
    </section>
  );
}
