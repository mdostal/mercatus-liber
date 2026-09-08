import { notFound } from "next/navigation";
import { PdpLongScroll } from "../../../components/pdp-long-scroll";
import { PdpTabbedDetail } from "../../../components/pdp-tabbed-detail";
import { InteractionTracker } from "../../../components/interaction-tracker";
import { getServices } from "../../../lib/services";
import { readActiveThemeBundle } from "../../../lib/theme-cookie";

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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { slug } = await params;
  const { template } = await searchParams;
  const { pdp, inventory } = await getServices();

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

  const Component =
    (viewModel.templateKey && TEMPLATE_COMPONENTS[viewModel.templateKey as keyof typeof TEMPLATE_COMPONENTS]) ||
    PdpTabbedDetail;

  return (
    <>
      <InteractionTracker eventName="product_viewed" properties={{ productId: viewModel.product.id, slug: viewModel.product.slug }} />
      <Component viewModel={viewModel} stockBySkuId={stockBySkuId} />
    </>
  );
}
