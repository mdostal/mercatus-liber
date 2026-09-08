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
  const { pdp } = await getServices();
  const viewModel = await pdp.getViewModel(slug, template);
  if (!viewModel) notFound();

  const Component =
    (viewModel.templateKey && TEMPLATE_COMPONENTS[viewModel.templateKey as keyof typeof TEMPLATE_COMPONENTS]) ||
    PdpTabbedDetail;

  return <Component viewModel={viewModel} />;
}
