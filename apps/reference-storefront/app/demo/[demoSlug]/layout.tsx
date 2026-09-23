import type { ComponentType, ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_BUNDLES } from "@mercatus-liber/theming";
import { NavBlueprintBar } from "../../../components/nav-blueprint-bar";
import { NavRail } from "../../../components/nav-rail";
import { NavTopBar } from "../../../components/nav-top-bar";
import { DEMO_REGISTRY, DEMO_SLUGS, isDemoSlug, type DemoSlug } from "../../../lib/demos";
import { resolvePageTemplateOverride } from "../../../lib/resolve-page-template";
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
  "nav.blueprint-bar": NavBlueprintBar,
} as const;

type NavChromeProps = {
  demoSlug: DemoSlug;
  displayName: string;
  navLinks: Array<{ href: string; label: string }>;
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

  // Real, confirmed live bug (2026-09-22, found while closing out the
  // sibling CMS demo-scoping fix, epic-backlog.md row 61): print-shop and
  // Northline Home Tech genuinely share ONE Postgres categories table (both
  // demos resolve the same global DATABASE_URL pool with no per-demo
  // persistence override configured) -- this call had zero demo scoping,
  // so print-shop's nav showed Northline's top-level categories mixed in
  // (and vice versa). `demoSlug` (marketing-catalog's Category.demoSlug) is
  // the real, structural fix -- same shape as the CMS listPages fix just
  // above/below.
  const topLevelCategories = await marketingCatalog.listChildCategories(null, { demoSlug });
  for (const category of topLevelCategories) {
    links.push({ href: `/demo/${demoSlug}/category/${category.slug}`, label: category.title });
  }

  // commerce-gap-audit-3: real, live finding -- ServiceAreaRepository.list()
  // had no demo-scoping concept at all, same bug class as the
  // categories/CMS-pages fix just above/below in this same file. Confirmed
  // live before this fix: print-shop's nav showed a "Service Areas" link
  // purely because Northline's 8 areas (a completely different business)
  // made this unscoped call's length > 0, and print-shop's own
  // `/locations` page listed all 11 cities from both businesses combined.
  const areas = await serviceAreas.listServiceAreas({ demoSlug });
  if (areas.length > 0) {
    links.push({ href: `/demo/${demoSlug}/locations`, label: "Service Areas" });
  }

  // Real, confirmed live bug (2026-09-22, user report: print-shop's "Fall
  // Sale" campaign also showed up in Broadleaf's and Northline's nav):
  // under the shared, global Sanity CMS backend all 3 demos persist into,
  // this listPages call had zero demo scoping -- it returned every demo's
  // marketing/campaign pages combined, every time, for every demo's nav.
  // `demoSlug` (packages/cms's Page.demoSlug, set by each seed function
  // above) is the real, structural fix -- not a slug-prefix convention,
  // which only helps a single targeted lookup, never a list query.
  const marketingPages = await cms.listPages({ pageType: "marketing", status: "published", demoSlug });
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
 * Every real shop link (categories/service-areas/campaigns/cart/search/
 * account) is prefixed with `/demo/${demoSlug}` (read from the route's own
 * params, not a hardcoded/default slug).
 *
 * cms-demo-scoping-and-nav-cleanup fix (2026-09-22, user report: the primary
 * shop nav read as "a wall of ~30 wrapped text links" mixing real product
 * categories with framework/meta links -- "Admin: Plugins", "<- Mercatus
 * Liber home", "Switch to {other demo}"): those 3 meta links used to be
 * rendered inline, in the SAME flat link list as categories/cart/account, by
 * every one of nav-top-bar.tsx/nav-rail.tsx/nav-blueprint-bar.tsx. Per the
 * user's explicit direction ("the demo stores don't link to the rest of the
 * docs and whatnot" -- they should stay real, useful, but clearly
 * secondary), they're now rendered ONCE, here, in the same small
 * already-existing top-right utility strip that already carried "Start here
 * / How this works" -- never duplicated into NavChrome's own `navLinks`
 * (which stays purely real shop navigation: categories, service areas,
 * campaigns) or into any nav template's own primary link list.
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

  // design-system-v2-02 / scc-04: resolve the "nav" page type's template via
  // resolvePageTemplateOverride's shared precedence (lib/resolve-page-template.ts)
  // -- an admin's own per-page-type override (content-layout dashboard) wins,
  // else the active theme bundle's own defaultTemplatesByPageType.nav
  // (undefined for the 7 pre-existing bundles, which don't define one), else
  // resolveTemplate's own first-registered-template default, "nav.top-bar".
  const { theming, storefrontViews } = await getServicesForDemo(demoSlug);
  // storefront-views-and-multi-catalog epic: a real, live-data-driven
  // discoverability fix -- a permanent second storefront (isDefaultOverride:
  // false) has no other real entry point anywhere in the app besides
  // knowing its exact /site/<slug> URL. Only ever lists PUBLISHED,
  // non-default-override views (a takeover view IS the home page while
  // live, so it needs no separate link; a draft view isn't real yet) --
  // empty for every demo with none seeded, so this is a no-op today for
  // any store that hasn't adopted the feature.
  const discoverableViews = (await storefrontViews.listViews(demoSlug)).filter(
    (view) => view.status === "active" && !view.isDefaultOverride,
  );
  const navTemplateKey = theming.resolveTemplate("nav", resolvePageTemplateOverride(theming, "nav", activeTheme));
  const NavChrome: ComponentType<NavChromeProps> =
    (navTemplateKey && NAV_TEMPLATES[navTemplateKey as keyof typeof NAV_TEMPLATES]) || NavTopBar;
  const isRailNav = navTemplateKey === "nav.rail";
  // "The Slow Catalog"'s asymmetric magazine-grid layouts (home/category)
  // need real room to show the mockup's 3-column feature+b/c/d/e grid --
  // additive, editorial-only widening, same pattern isRailNav already
  // established for nav.rail. Every other bundle keeps today's exact 720px
  // reading-width layout, byte-for-byte.
  const isEditorial = activeTheme.key === "editorial";
  // visual-fidelity-maximalist: gates the real "Blaze Theme" Google Fonts
  // load below -- same additive, bundle-scoped pattern as isEditorial.
  const isMaximalist = activeTheme.key === "maximalist";
  // visual-fidelity-datasheet: same additive, bundle-scoped pattern as
  // isEditorial/isMaximalist above -- gates "Datasheet Storefront"'s real
  // Google Fonts load and its wider reading width (the hairline-grid
  // product grid needs real room for more than a single column, same
  // reasoning as isEditorial's magazine-grid).
  const isDatasheet = activeTheme.key === "datasheet";
  const navLinks = await buildNavLinks(demoSlug);

  const page = (
    <html lang="en">
      <head>
        {/* Real CSS custom properties from the active theme's tokens -- not just internal ThemingService state. */}
        <style>{`:root { ${rootCssVars} }`}</style>
        {/*
          Real Google Fonts for "The Slow Catalog" (Fraunces/Newsreader/
          Libre Franklin), ported verbatim from the approved design
          mockup's own <link> tag -- additive, only rendered when
          "editorial" is the active bundle, so every other theme's
          font-loading (today, none) is unaffected.
        */}
        {isEditorial && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400;1,600&family=Newsreader:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Libre+Franklin:wght@400;500;600;700;800&display=swap"
            />
          </>
        )}
        {/*
          Real Google Fonts for "Blaze Theme" (Anton/Archivo/Space Mono),
          ported verbatim from the approved design mockup's own <link> tag --
          additive, only rendered when "maximalist" is the active bundle,
          same isEditorial pattern above, so every other theme's
          font-loading is unaffected.
        */}
        {isMaximalist && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700&family=Space+Mono:wght@400;700&display=swap"
            />
          </>
        )}
        {/*
          Real Google Fonts for "Datasheet Storefront" (Archivo/IBM Plex
          Sans/IBM Plex Mono), ported verbatim from the approved design
          mockup's own <link> tag -- additive, only rendered when
          "datasheet" is the active bundle, same isEditorial/isMaximalist
          pattern above.
        */}
        {isDatasheet && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
            />
          </>
        )}
      </head>
      <body
        style={{
          fontFamily: "var(--font-family)",
          background: "var(--color-background)",
          color: "var(--color-text)",
          // nav.rail needs more horizontal room than the single-column
          // top-bar layout ever did -- widened only for that template, so
          // every other (nav.top-bar) bundle keeps today's exact 720px
          // reading-width layout. editorial's magazine-grid layouts and
          // datasheet's hairline-grid product grid need the same real room
          // (see isEditorial/isDatasheet above).
          maxWidth: isRailNav ? 1100 : isEditorial ? 1180 : isDatasheet ? 1240 : 720,
          margin: "0 auto",
          padding: 24,
          minHeight: "100vh",
        }}
      >
        {/*
          landing-visual-glow-up (architecture story) + cms-demo-scoping-and-
          nav-cleanup fix: the one shared, clearly-secondary utility strip
          for every cross-demo/framework/docs link this app has -- "Start
          here" / "How this works" / any discoverable alternate storefront
          view (original), plus (as of this fix) "Admin: Plugins", "<-
          Mercatus Liber home", and "Switch to {other demo}", RELOCATED here
          out of the primary shop nav (nav-top-bar.tsx/nav-rail.tsx/
          nav-blueprint-bar.tsx no longer render any of the 3 meta links --
          real live bug, confirmed by user screenshot: mixing them into the
          same flat list as product categories/cart/account made the nav
          read as a wall of ~30 wrapped text links instead of a real store's
          navigation). Rendered ONCE, HERE, at the one shared call site
          every nav template sits inside -- never duplicated into any nav
          template's own primary link list.
        */}
        {/*
          a11y-audit: this strip is a cluster of navigation links sitting
          directly under <body>, ahead of <NavChrome>'s own <header>/<nav> --
          axe-core's "region" rule (WCAG 2.4.1-adjacent best practice) flagged
          it live on print-shop as page content not contained by any
          landmark. A <div> was never semantically wrong (nothing here is
          interactive beyond the links themselves), but it wasn't right
          either -- these ARE navigation links, so <nav> is the honest
          element, not a wrapper-for-wrapping's-sake. aria-label distinguishes
          it from NavChrome's own primary <nav> so screen-reader users get
          two named landmarks, not two unlabeled "navigation" regions.

          Also a11y-audit: these links' color used to fall back to
          var(--color-muted, var(--color-primary)) -- fine for the 4 bundles that
          define --color-muted, but the 6 that don't (dark/minimal/vibrant/retro/
          high-contrast/northline) fell through to --color-primary instead, a color
          meant for buttons/CTAs, not small secondary nav text. Confirmed live via
          axe-core on broadleaf's default "vibrant" theme: #f97316-on-#fff7ed
          measured 2.64:1 across all 15 links here, a severe WCAG AA fail (needs
          4.5:1). Every bundle's --color-text already passes 4.5:1 against its own
          --color-background by a wide margin (verified for all 10 bundles by hand,
          worst case 12.05:1), so the fallback below is now --color-text, not
          --color-primary -- closes the gap for every current and future bundle
          that skips defining --color-muted, without needing a token added to each.
        */}
        <nav
          aria-label="Site utility links"
          style={{
            textAlign: "right",
            fontSize: "0.74rem",
            fontFamily: "var(--font-family)",
            padding: "2px 0 6px",
          }}
        >
          <a
            href={`/demo/${demoSlug}/start`}
            style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none", fontWeight: 600 }}
          >
            Start here &rarr;
          </a>{" "}
          &middot;{" "}
          <a href="/architecture" style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none" }}>
            How this works &rarr;
          </a>
          {discoverableViews.map((view) => (
            <span key={view.id}>
              {" "}
              &middot;{" "}
              <a
                href={`/demo/${demoSlug}/site/${view.slug}`}
                style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none" }}
              >
                Also see: {view.name} &rarr;
              </a>
            </span>
          ))}{" "}
          &middot;{" "}
          <a
            href={`/demo/${demoSlug}/admin/plugins`}
            style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none" }}
          >
            Admin: Plugins
          </a>{" "}
          &middot;{" "}
          <a href="/" style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none" }}>
            &larr; Mercatus Liber home
          </a>
          {otherDemos.map((other) => (
            <span key={other.slug}>
              {" "}
              &middot;{" "}
              <a
                href={`/demo/${other.slug}`}
                style={{ color: "var(--color-muted, var(--color-text))", textDecoration: "none" }}
              >
                Switch to {other.displayName}
              </a>
            </span>
          ))}
        </nav>
        <NavChrome
          demoSlug={demoSlug}
          displayName={DEMO_REGISTRY[demoSlug].displayName}
          navLinks={navLinks}
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
