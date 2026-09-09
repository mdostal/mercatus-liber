import type { ComponentType, ReactNode } from "react";
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
  otherDemos: Array<{ slug: DemoSlug; displayName: string }>;
  bundles: typeof THEME_BUNDLES;
  activeThemeKey: string;
  children: ReactNode;
};

export const metadata = {
  title: "Shop",
  description: "Browse the catalog, add to cart, and check out.",
};

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
