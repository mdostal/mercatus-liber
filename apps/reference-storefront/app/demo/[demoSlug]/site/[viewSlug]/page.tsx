import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isViewLive } from "@mercatus-liber/storefront-views";
import { HOME_TEMPLATES, HomeStandardGrid } from "../../../../../lib/home-templates";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug, type DemoSlug } from "../../../../../lib/demos";
import { resolvePageTemplateOverride } from "../../../../../lib/resolve-page-template";
import { buildViewSections } from "../../../../../lib/storefront-view-sections";
import { getServicesForDemo } from "../../../../../lib/services";
import { canonicalUrl } from "../../../../../lib/site-url";
import { readActiveThemeBundle } from "../../../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/**
 * storefront-views-and-multi-catalog epic: real per-view metadata, same
 * pattern as category/[slug]/page.tsx's own generateMetadata -- title/
 * description come from the view's own real heroHeadline/heroSubheadline
 * copy, canonical is this view's real absolute /site/<slug> URL. A
 * draft/archived/out-of-window view (isViewLive false) gets no metadata at
 * all, same as an unknown slug -- it 404s, so there is nothing real to
 * describe.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ demoSlug: string; viewSlug: string }>;
}): Promise<Metadata> {
  const { demoSlug, viewSlug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const { storefrontViews } = await getServicesForDemo(demoSlug);
  const view = await storefrontViews.getViewBySlug(demoSlug, viewSlug);
  if (!view || !isViewLive(view)) return {};

  const path = `/demo/${demoSlug}/site/${view.slug}`;

  return {
    title: view.name,
    description: view.heroSubheadline,
    alternates: { canonical: canonicalUrl(path) },
  };
}

/**
 * storefront-views-and-multi-catalog epic: a curated view's own permanent
 * entry point -- /demo/<demoSlug>/site/<slug>. A draft/archived/
 * out-of-window view 404s here exactly like an unknown slug (isViewLive is
 * the same live/not-live predicate getActiveDefaultOverride uses
 * internally, imported directly rather than re-derived). This route is a
 * curated ENTRY POINT over the store's own already-real catalog, never a
 * parallel copy of category/PDP pages -- every category/product link this
 * renders (via buildViewSections' category-spot/product-grid sections)
 * points at the exact same real /category/[slug] and /products/[slug]
 * routes every other page in this app uses.
 */
export default async function StorefrontViewPage({
  params,
}: {
  params: Promise<{ demoSlug: string; viewSlug: string }>;
}) {
  const { demoSlug, viewSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { storefrontViews, marketingCatalog, theming } = await getServicesForDemo(demoSlug);
  const view = await storefrontViews.getViewBySlug(demoSlug, viewSlug);
  if (!view || !isViewLive(view)) notFound();

  const baseTheme = await readActiveThemeBundle(demoSlug);
  const { sections, theme: activeTheme } = await buildViewSections({ marketingCatalog }, view, baseTheme);

  // scc-04: same resolvePageTemplateOverride composition page.tsx's own home
  // page uses -- an admin's own "home" page-type override (content-layout
  // dashboard) wins over this view's own resolved theme too.
  const templateKey = theming.resolveTemplate("home", resolvePageTemplateOverride(theming, "home", activeTheme));
  const Template: ComponentType<{ demoSlug: DemoSlug; sections: typeof sections }> =
    (templateKey && HOME_TEMPLATES[templateKey as keyof typeof HOME_TEMPLATES]) || HomeStandardGrid;

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug: `site/${view.slug}` }} />
      <Template demoSlug={demoSlug} sections={sections} />
    </main>
  );
}
