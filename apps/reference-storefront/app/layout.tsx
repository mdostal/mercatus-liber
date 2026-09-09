import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_BUNDLES } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "../components/theme-switcher";
import { readActiveThemeBundle } from "../lib/theme-cookie";

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
 * so every route in this app, not just /admin, would break in local
 * development without this guard. Skipping the provider entirely when
 * Clerk isn't configured keeps every shopper-facing route rendering exactly
 * as before this story; app/admin/layout.tsx's own adminAuth.getCurrentSession()
 * check (the dev-default adapter, in that case) is the real /admin gate.
 */
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

export default async function RootLayout({ children }: { children: ReactNode }) {
  const activeTheme = await readActiveThemeBundle();
  const rootCssVars = Object.entries(activeTheme.tokens)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");

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
          <a href="/" style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-primary)" }}>
            Mercatus Liber -- Reference Storefront
          </a>
          {" · "}
          <a href="/cart" style={{ color: "var(--color-primary)" }}>Cart</a>
          {" · "}
          <a href="/search" style={{ color: "var(--color-primary)" }}>Search</a>
          {" · "}
          <a href="/campaign/fall-sale" style={{ color: "var(--color-primary)" }}>Fall Sale</a>
          {" · "}
          <a href="/account" style={{ color: "var(--color-primary)" }}>Account</a>
          {" · "}
          <a href="/admin/plugins" style={{ color: "var(--color-primary)" }}>Admin: Plugins</a>

          <ThemeSwitcher bundles={THEME_BUNDLES} activeKey={activeTheme.key} />
        </header>
        {children}
      </body>
    </html>
  );

  return clerkConfigured ? <ClerkProvider>{page}</ClerkProvider> : page;
}
