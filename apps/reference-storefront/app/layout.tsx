import type { ReactNode } from "react";
import { THEME_BUNDLES } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "../components/theme-switcher";
import { readActiveThemeBundle } from "../lib/theme-cookie";

export const metadata = {
  title: "Mercatus Liber -- Reference Storefront",
  description: "Minimal integration proof for Mercatus Liber's core-foundation packages.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const activeTheme = await readActiveThemeBundle();
  const rootCssVars = Object.entries(activeTheme.tokens)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");

  return (
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
}
