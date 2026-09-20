import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import type { ComponentInstance } from "@mercatus-liber/cms";
import { HOME_TEMPLATES, HomeStandardGrid } from "../../../lib/home-templates";
import { InteractionTracker } from "../../../components/interaction-tracker";
import { isDemoSlug, type DemoSlug } from "../../../lib/demos";
import { resolvePageTemplateOverride } from "../../../lib/resolve-page-template";
import { getServicesForDemo } from "../../../lib/services";
import { buildViewSections } from "../../../lib/storefront-view-sections";
import { readActiveThemeBundle } from "../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/**
 * demo-routing-05: this is the demo's own home page (CMS "home" page
 * content) -- moved here from the pre-move app/page.tsx, which is now the
 * demo-agnostic framework landing page (see app/(landing)/page.tsx) per
 * design-discussion.md §3. Uses the real `params.demoSlug` from the route,
 * same as every other page under this tree -- DEFAULT_DEMO_SLUG was only
 * ever a stand-in for routes that render outside `/demo/[demoSlug]/...`,
 * which this route no longer is.
 *
 * storefront-views-and-multi-catalog epic: the FIRST thing this page does
 * after resolving services is check whether a "default override" storefront
 * view is currently live for this demo (getActiveDefaultOverride -- the real
 * "is a campaign takeover live right now" check, re-evaluated fresh on every
 * request, never cached). When one is live, this page renders THAT view's
 * curated hero/categories/products (via the exact same buildViewSections
 * helper app/demo/[demoSlug]/site/[viewSlug]/page.tsx renders through)
 * instead of the store's normal CMS "home" page content -- the real
 * "swap over your current site for an event" mechanic, reverting
 * automatically once the view's window ends or it's archived. When there is
 * no live override (null -- the common case, and the only case until a demo
 * actually seeds one), this page's behavior is byte-for-byte unchanged from
 * before this epic.
 */
export default async function DemoHomePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { cms, marketingCatalog, storefrontViews, theming } = await getServicesForDemo(demoSlug);
  const baseTheme = await readActiveThemeBundle(demoSlug);
  const activeOverride = await storefrontViews.getActiveDefaultOverride(demoSlug);

  // real-provider-verification epic: namespaced per-demo ("home-print-shop"
  // etc, not the bare literal "home" every seed function used to write) --
  // see lib/seed.ts's own doc comment on this same correction. Harmless
  // under the in-memory default; correct now under a real SHARED external
  // CMS backend too, where all 3 demos' seed functions write into the same
  // dataset and would otherwise silently clobber each other's home page.
  const homeSlug = `home-${demoSlug}`;
  let sections: ComponentInstance[];
  let activeTheme = baseTheme;
  let trackedSlug = homeSlug;

  if (activeOverride) {
    const viewSections = await buildViewSections({ marketingCatalog }, activeOverride, baseTheme);
    sections = viewSections.sections;
    activeTheme = viewSections.theme;
    trackedSlug = `site/${activeOverride.slug}`;
  } else {
    const home = await cms.getPageBySlug(homeSlug);
    if (!home) {
      return (
        <main>
          <InteractionTracker eventName="page_viewed" properties={{ slug: homeSlug }} />
          <h1>Home</h1>
          <p>We're still setting up the shop -- check back soon.</p>
        </main>
      );
    }
    sections = home.sections;
  }

  // scc-04: resolvePageTemplateOverride's shared precedence (lib/resolve-page-template.ts)
  // -- an admin's own per-page-type override (content-layout dashboard) wins,
  // else the active theme bundle's own defaultTemplatesByPageType.home
  // (undefined for the 7 pre-existing bundles, which don't define one), else
  // resolveTemplate's own first-registered-template default, "home.standard-grid".
  const templateKey = theming.resolveTemplate("home", resolvePageTemplateOverride(theming, "home", activeTheme));
  const Template: ComponentType<{ demoSlug: DemoSlug; sections: ComponentInstance[] }> =
    (templateKey && HOME_TEMPLATES[templateKey as keyof typeof HOME_TEMPLATES]) || HomeStandardGrid;

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug: trackedSlug }} />
      <Template demoSlug={demoSlug} sections={sections} />
    </main>
  );
}
