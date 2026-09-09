import type { ReactNode } from "react";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "./theme-switcher";
import type { DemoSlug } from "../lib/demos";

/**
 * The "nav.top-bar" template -- today's only current chrome layout
 * (standard horizontal top navigation bar), extracted verbatim from
 * app/demo/[demoSlug]/layout.tsx into its own component so it can compete
 * with nav-rail.tsx as a real registered template. Zero visual/behavioral
 * change from before this story -- registered first in
 * packages/theming/src/service.ts's DEFAULT_TEMPLATES so it stays the
 * deterministic fallback for every one of the 7 pre-existing bundles (see
 * that file's own comment).
 */
export function NavTopBar({
  demoSlug,
  displayName,
  otherDemos,
  bundles,
  activeThemeKey,
  children,
}: {
  demoSlug: DemoSlug;
  displayName: string;
  otherDemos: Array<{ slug: DemoSlug; displayName: string }>;
  bundles: ThemeBundle[];
  activeThemeKey: string;
  children: ReactNode;
}) {
  return (
    <>
      <header style={{ marginBottom: 24, borderBottom: "1px solid var(--color-accent)", paddingBottom: 12 }}>
        <a href={`/demo/${demoSlug}`} style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-primary)" }}>
          {displayName}
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
        {otherDemos.map((other) => (
          <span key={other.slug}>
            {" · "}
            <a href={`/demo/${other.slug}`} style={{ color: "var(--color-primary)" }}>
              Switch to {other.displayName}
            </a>
          </span>
        ))}

        <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
      </header>
      {children}
    </>
  );
}
