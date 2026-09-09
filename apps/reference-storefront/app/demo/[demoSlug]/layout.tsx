import type { ComponentType, ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_BUNDLES } from "@mercatus-liber/theming";
import { NavRail } from "../../../components/nav-rail";
import { NavTopBar } from "../../../components/nav-top-bar";
import { DEMO_REGISTRY, DEMO_SLUGS, isDemoSlug, type DemoSlug } from "../../../lib/demos";
import { getServicesForDemo } from "../../../lib/services";
import { readActiveThemeBundle } from "../../../lib/theme-cookie";

/**
 * Template-key -> component map, the app-layer half of the theming
 * contract for the "nav" page type -- same shape as products/[slug]/
 * page.tsx's PDP_TEMPLATES map. Adding a new registered nav template
 * requires one more entry here.
 */
const NAV_TEMPLATES = {
  "nav.top-bar": NavTopBar,
  "nav.rail": NavRail,
} as const;

type NavChromeProps = {
  demoSlug: DemoSlug;
  displayName: string;
  navLinks: Array<{ href: string; label: string }>;
  otherDemos: Array<{ slug: DemoSlug; displayName: string }>;
  bundles: typeof THEME_BUNDLES;
  activeThemeKey: string;
  children: ReactNode;
};

/**
 * seo-01: replaces the old static `export const metadata = { title: "Shop",
 * ... }` -- a confirmed defect (design-discussion.md §0): every route across
 * all 3 demos shared this one literal "Shop" tab title, with zero per-page
 * distinction. This is now a real root-template FALLBACK, not a page's own
 * title: `title.default` is what a leaf route gets if it doesn't define its
 * own `title` (the demo home page, which has none today -- confirmed by
 * reading app/demo/[demoSlug]/page.tsx), and `title.template` is what wraps
 * any leaf route's own title (PDP/category/search below all set one), per
 * generate-metadata.md's own "title.template applies to child route
 * segments" documented behavior.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ demoSlug: string }>;
}): Promise<Metadata> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const demo = DEMO_REGISTRY[demoSlug];

  return {
    title: {
      template: `%s | ${demo.displayName}`,
      default: demo.displayName,
    },
    description: demo.description,
  };
}

/**
 * Same signal lib/services.ts uses to choose the real Clerk adminAuth
 * adapter over the dev default. <ClerkProvider/> unconditionally throws
 * MissingPublishableKeyError/MissingSecretKeyError the moment any
 * Clerk-aware code runs without a real key configured, and its "keyless"
 * auto-provisioning fallback needs live network access to Clerk's own API
 * (confirmed by reading @clerk/nextjs@7.9.1's own ClerkProvider source) --
 * so every route under this demo tree, not just /admin, would break in
 * local development without this guard. Skipping the provider entirely
 * when Clerk isn't configured keeps every shopper-facing route rendering
 * exactly as before; app/demo/[demoSlug]/admin/layout.tsx's own
 * adminAuth.getCurrentSession() check (the dev-default adapter, in that
 * case) is the real /demo/[demoSlug]/admin gate.
 */
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

/**
 * northline-depth-02: builds the shared nav components' `navLinks` prop
 * server-side, per demo, from real data -- replaces the hardcoded
 * `campaign/fall-sale` link nav-top-bar.tsx/nav-rail.tsx used to carry
 * (design-discussion.md §2a). Three real sources, in nav order:
 *   1. Every top-level category the demo's own MarketingCatalogService
 *      actually has (listChildCategories(null) -- parentId: null is exactly
 *      "top-level" per that service's own doc comment). Northline's 4
 *      categories are all top-level, and so are print-shop's real 4
 *      (Embroidery, Custom Coasters, Apparel, Drinkware -- see
 *      print-shop-02's lib/seed.ts) -- confirming this mechanism needed
 *      zero new nav code once real, top-level categories existed for
 *      print-shop, exactly as design-discussion.md §3 predicted.
 *   2. A link to the service-area/location index (app/demo/[demoSlug]/
 *      locations/page.tsx, which already exists), included only when the
 *      demo actually has at least one ServiceArea -- never a link to an
 *      empty index.
 *   3. One entry per real, currently-published CMS marketing/campaign page
 *      (print-shop's real "fall-sale" campaign is resolved here dynamically
 *      via cms.listPages -- never hardcoded as a fallback string). Northline
 *      has no marketing page seeded today, so this list is empty for it,
 *      which is the correct "absent, not broken" behavior per the spec.
 */
async function buildNavLinks(demoSlug: DemoSlug): Promise<Array<{ href: string; label: string }>> {
  const { marketingCatalog, serviceAreas, cms } = await getServicesForDemo(demoSlug);
  const links: Array<{ href: string; label: string }> = [];

  const topLevelCategories = await marketingCatalog.listChildCategories(null);
  for (const category of topLevelCategories) {
    links.push({ href: `/demo/${demoSlug}/category/${category.slug}`, label: category.title });
  }

  const areas = await serviceAreas.listServiceAreas();
  if (areas.length > 0) {
    links.push({ href: `/demo/${demoSlug}/locations`, label: "Service Areas" });
  }

  const marketingPages = await cms.listPages({ pageType: "marketing", status: "published" });
  for (const page of marketingPages) {
    links.push({ href: `/demo/${demoSlug}/campaign/${page.slug}`, label: page.title });
  }

  return links;
}

/**
 * demo-routing-05: this is now the app's SECOND root layout (design-
 * discussion.md §3, "Two root layouts, by design") -- it carries today's
 * actual shop nav (moved here from the old app/layout.tsx, which is now
 * the demo-agnostic framework landing page's layout at
 * app/(landing)/layout.tsx). It defines its own <html>/<body> because
 * there is no app/layout.tsx directly in app/ any more -- see
 * app/(landing)/layout.tsx's own doc comment for why that's required to
 * get genuine "multiple root layouts" (a full page reload navigating
 * to/from the landing page) instead of a soft client-side transition.
 *
 * Every link below is prefixed with `/demo/${demoSlug}` (read from the
 * route's own params, not a hardcoded/default slug), plus two additions
 * beyond the original nav: a link back to the root landing page, and a
 * link to switch straight to browsing the OTHER live demo without a stop
 * at the landing page first.
 */
export default async function DemoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ demoSlug: string }>;
}) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const activeTheme = await readActiveThemeBundle(demoSlug);
  const rootCssVars = Object.entries(activeTheme.tokens)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");

  // Both demos are meant to be discoverable from each other (design-
  // discussion.md §3) -- list every OTHER known demo slug as a switch link.
  // Written to not assume exactly 2 demos even though DEMO_SLUGS is 2 today.
  const otherDemos = DEMO_SLUGS.filter((slug) => slug !== demoSlug).map((slug) => ({
    slug,
    displayName: DEMO_REGISTRY[slug].displayName,
  }));

  // design-system-v2-02: resolve the "nav" page type's template the exact
  // same way products/[slug]/page.tsx resolves "pdp" -- the active theme
  // bundle's own defaultTemplatesByPageType.nav is passed as the explicit
  // override (undefined for the 7 pre-existing bundles, which don't define
  // one, so resolveTemplate falls back to its own first-registered-template
  // default, "nav.top-bar" -- see packages/theming/src/service.ts).
  const { theming } = await getServicesForDemo(demoSlug);
  const navTemplateKey = theming.resolveTemplate("nav", activeTheme.defaultTemplatesByPageType.nav);
  const NavChrome: ComponentType<NavChromeProps> =
    (navTemplateKey && NAV_TEMPLATES[navTemplateKey as keyof typeof NAV_TEMPLATES]) || NavTopBar;
  const isRailNav = navTemplateKey === "nav.rail";
  const navLinks = await buildNavLinks(demoSlug);

  const page = (
    <html lang="en">
      <head>
        {/* Real CSS custom properties from the active theme's tokens -- not just internal ThemingService state. */}
        <style>{`:root { ${rootCssVars} }`}</style>
      </head>
      <body
        style={{
          fontFamily: "var(--font-family)",
          background: "var(--color-background)",
          color: "var(--color-text)",
          // nav.rail needs more horizontal room than the single-column
          // top-bar layout ever did -- widened only for that template, so
          // every other (nav.top-bar) bundle keeps today's exact 720px
          // reading-width layout.
          maxWidth: isRailNav ? 1100 : 720,
          margin: "0 auto",
          padding: 24,
          minHeight: "100vh",
        }}
      >
        <NavChrome
          demoSlug={demoSlug}
          displayName={DEMO_REGISTRY[demoSlug].displayName}
          navLinks={navLinks}
          otherDemos={otherDemos}
          bundles={THEME_BUNDLES}
          activeThemeKey={activeTheme.key}
        >
          {children}
        </NavChrome>
      </body>
    </html>
  );

  return clerkConfigured ? <ClerkProvider>{page}</ClerkProvider> : page;
}
