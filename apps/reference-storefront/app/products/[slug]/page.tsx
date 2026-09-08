import { notFound } from "next/navigation";
import { PdpLongScroll } from "../../../components/pdp-long-scroll";
import { PdpTabbedDetail } from "../../../components/pdp-tabbed-detail";
import { getServices } from "../../../lib/services";

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
  const viewModel = await pdp.getViewModel(slug, template);
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

  return <Component viewModel={viewModel} stockBySkuId={stockBySkuId} />;
}
