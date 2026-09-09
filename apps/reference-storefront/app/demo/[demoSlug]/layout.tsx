import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_BUNDLES } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "../../../components/theme-switcher";
import { DEMO_REGISTRY, DEMO_SLUGS, isDemoSlug } from "../../../lib/demos";
import { readActiveThemeBundle } from "../../../lib/theme-cookie";

export const metadata = {
  title: "Mercatus Liber -- Reference Storefront",
  description: "Minimal integration proof for Mercatus Liber's core-foundation packages.",
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
  const otherDemos = DEMO_SLUGS.filter((slug) => slug !== demoSlug);

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
          maxWidth: 720,
          margin: "0 auto",
          padding: 24,
          minHeight: "100vh",
        }}
      >
        <header style={{ marginBottom: 24, borderBottom: "1px solid var(--color-accent)", paddingBottom: 12 }}>
          <a
            href={`/demo/${demoSlug}`}
            style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-primary)" }}
          >
            {DEMO_REGISTRY[demoSlug].displayName}
          </a>
          {" · "}
          <a href={`/demo/${demoSlug}/cart`} style={{ color: "var(--color-primary)" }}>
            Cart
          </a>
          {" · "}
          <a href={`/demo/${demoSlug}/search`} style={{ color: "var(--color-primary)" }}>
            Search
          </a>
          {" · "}
          <a href={`/demo/${demoSlug}/campaign/fall-sale`} style={{ color: "var(--color-primary)" }}>
            Fall Sale
          </a>
          {" · "}
          <a href={`/demo/${demoSlug}/account`} style={{ color: "var(--color-primary)" }}>
            Account
          </a>
          {" · "}
          <a href={`/demo/${demoSlug}/admin/plugins`} style={{ color: "var(--color-primary)" }}>
            Admin: Plugins
          </a>
          {" · "}
          <a href="/" style={{ color: "var(--color-primary)" }}>
            &larr; Mercatus Liber home
          </a>
          {otherDemos.map((otherSlug) => (
            <span key={otherSlug}>
              {" · "}
              <a href={`/demo/${otherSlug}`} style={{ color: "var(--color-primary)" }}>
                Switch to {DEMO_REGISTRY[otherSlug].displayName}
              </a>
            </span>
          ))}

          <ThemeSwitcher demoSlug={demoSlug} bundles={THEME_BUNDLES} activeKey={activeTheme.key} />
        </header>
        {children}
      </body>
    </html>
  );

  return clerkConfigured ? <ClerkProvider>{page}</ClerkProvider> : page;
}
