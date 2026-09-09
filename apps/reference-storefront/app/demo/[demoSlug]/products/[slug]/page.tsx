import { notFound } from "next/navigation";
import type { TierPricing } from "@mercatus-liber/bundles";
import { PdpLongScroll } from "../../../../../components/pdp-long-scroll";
import { PdpTabbedDetail } from "../../../../../components/pdp-tabbed-detail";
import { BundleTierSelector } from "../../../../../components/bundle-tier-selector";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { RecommendationShelf, resolvePdpRecommendations } from "../../../../../components/recommendation-shelf";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";
import { readActiveThemeBundle } from "../../../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/**
 * Template-key -> component map, the app-layer half of the theming contract
 * (theming resolves WHICH key; this map decides what that key renders as).
 * Adding a new registered template requires one more entry here.
 */
const TEMPLATE_COMPONENTS = {
  "pdp.tabbed-detail": PdpTabbedDetail,
  "pdp.long-scroll": PdpLongScroll,
} as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string; slug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { template } = await searchParams;
  const { pdp, inventory, bundles, recommendations, catalog, marketingCatalog } = await getServicesForDemo(demoSlug);

  // Explicit ?template= always wins; otherwise fall back to the active
  // theme's PDP choice (a per-request, per-call override -- never mutates
  // the shared theming singleton, so concurrent requests with different
  // themes never race each other). Only pdp's own internal default (theming
  // .resolveTemplate) is used if neither is provided.
  const activeTheme = await readActiveThemeBundle();
  const templateOverride = template ?? activeTheme.defaultTemplatesByPageType.pdp;

  const viewModel = await pdp.getViewModel(slug, templateOverride);
  if (!viewModel) notFound();

  // Stock is deliberately NOT part of pdp's view model (see pt-02's design
  // decision -- no inventory epic existed yet); composed here at the app
  // layer instead, same "app composes multiple services" pattern as
  // everything else in this reference storefront.
  const stockBySkuId: Record<string, number> = {};
  for (const sku of viewModel.skus) {
    const level = await inventory.getStock(sku.id);
    stockBySkuId[sku.id] = level ? level.onHand - level.reserved : 0;
  }

  // Bundles is deliberately NOT part of pdp's view model, same "app composes
  // multiple services" pattern as stock above -- see design-discussion.md §5,
  // which resolves docs/subsystems/04-pdp.md's open question 1 this way for
  // v1 rather than folding bundle data into PdpViewModel itself. When a
  // product has no attached bundle, this is a no-op and the page renders
  // exactly as it did before this story.
  const bundle = await bundles.getBundleForProduct(viewModel.product.id);
  const pricingByTierId: Record<string, TierPricing> = {};
  if (bundle) {
    for (const tier of bundle.tiers) {
      const pricing = await bundles.computeTierPricing(bundle.id, tier.id);
      if (pricing) pricingByTierId[tier.id] = pricing;
    }
  }

  const Component =
    (viewModel.templateKey && TEMPLATE_COMPONENTS[viewModel.templateKey as keyof typeof TEMPLATE_COMPONENTS]) ||
    PdpTabbedDetail;

  // Recommendations is deliberately NOT part of pdp's view model, same
  // "app composes multiple services" pattern as stock/bundles above -- see
  // design-discussion.md §3 (upsell-cross-sell). Curated rule first, falling
  // back to the same-category heuristic, or nothing at all when neither
  // yields a product -- this call is a no-op for a product with no attached
  // recommendation data, matching this story's zero-regression requirement.
  const recommendationShelf = await resolvePdpRecommendations(
    { recommendations, catalog, marketingCatalog },
    viewModel.product.id,
  );

  return (
    <>
      <InteractionTracker eventName="product_viewed" properties={{ productId: viewModel.product.id, slug: viewModel.product.slug }} />
      {bundle ? <BundleTierSelector bundle={bundle} pricingByTierId={pricingByTierId} /> : null}
      <Component viewModel={viewModel} stockBySkuId={stockBySkuId} />
      {recommendationShelf ? <RecommendationShelf {...recommendationShelf} /> : null}
    </>
  );
}
