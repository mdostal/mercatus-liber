import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import type { ComponentInstance } from "@mercatus-liber/cms";
import { HomeMagazineGrid } from "../../../components/home-magazine-grid";
import { HomeSpecGrid } from "../../../components/home-spec-grid";
import { HomeStandardGrid } from "../../../components/home-standard-grid";
import { InteractionTracker } from "../../../components/interaction-tracker";
import { isDemoSlug, type DemoSlug } from "../../../lib/demos";
import { getServicesForDemo } from "../../../lib/services";
import { readActiveThemeBundle } from "../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/**
 * Template-key -> component map, the app-layer half of the theming
 * contract (mirrors products/[slug]/page.tsx's PDP_TEMPLATES map exactly).
 * Adding a new registered "home" template requires one more entry here.
 */
const HOME_TEMPLATES = {
  "home.standard-grid": HomeStandardGrid,
  "home.magazine-grid": HomeMagazineGrid,
  "home.spec-grid": HomeSpecGrid,
} as const;

/**
 * demo-routing-05: this is the demo's own home page (CMS "home" page
 * content) -- moved here from the pre-move app/page.tsx, which is now the
 * demo-agnostic framework landing page (see app/(landing)/page.tsx) per
 * design-discussion.md §3. Uses the real `params.demoSlug` from the route,
 * same as every other page under this tree -- DEFAULT_DEMO_SLUG was only
 * ever a stand-in for routes that render outside `/demo/[demoSlug]/...`,
 * which this route no longer is.
 */
export default async function DemoHomePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { cms, theming } = await getServicesForDemo(demoSlug);
  const home = await cms.getPageBySlug("home");

  if (!home) {
    return (
      <main>
        <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
        <h1>Home</h1>
        <p>We're still setting up the shop -- check back soon.</p>
      </main>
    );
  }

  // Same override-from-active-bundle pattern PDP already uses: the active
  // theme bundle's own defaultTemplatesByPageType.home is passed as the
  // explicit override (undefined for the 7 pre-existing bundles, which
  // don't define one, so resolveTemplate falls back to its own
  // first-registered-template default, "home.standard-grid").
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateKey = theming.resolveTemplate("home", activeTheme.defaultTemplatesByPageType.home);
  const Template: ComponentType<{ demoSlug: DemoSlug; sections: ComponentInstance[] }> =
    (templateKey && HOME_TEMPLATES[templateKey as keyof typeof HOME_TEMPLATES]) || HomeStandardGrid;

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
      <Template demoSlug={demoSlug} sections={home.sections} />
    </main>
  );
}
