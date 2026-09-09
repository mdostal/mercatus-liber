import type { ReactNode } from "react";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "./theme-switcher";
import type { DemoSlug } from "../lib/demos";

const RAIL_WIDTH_PX = 220;

/**
 * The "nav.rail" template -- a real fixed left side-rail nav with jump
 * links, per "Blaze Theme"'s structural signature (design-discussion.md
 * §1: "fixed left-rail jump-nav pattern"). Same links/data as nav-top-bar
 * (this is a layout/visual variant, not a different navigation model), just
 * arranged as a sticky left column beside the page content instead of a
 * horizontal bar above it. Collapses to a static top bar under 768px via a
 * real CSS media query (a component-scoped <style> block, same technique
 * app/demo/[demoSlug]/layout.tsx already uses for its :root token style) --
 * inline React style objects can't express a media query on their own.
 */
export function NavRail({
  demoSlug,
  displayName,
  navLinks,
  otherDemos,
  bundles,
  activeThemeKey,
  children,
}: {
  demoSlug: DemoSlug;
  displayName: string;
  navLinks: Array<{ href: string; label: string }>;
  otherDemos: Array<{ slug: DemoSlug; displayName: string }>;
  bundles: ThemeBundle[];
  activeThemeKey: string;
  children: ReactNode;
}) {
  return (
    <div className="ml-nav-rail-shell">
      <style>{`
        .ml-nav-rail-shell { display: flex; align-items: flex-start; }
        .ml-nav-rail {
          position: sticky;
          top: 0;
          width: ${RAIL_WIDTH_PX}px;
          flex: 0 0 ${RAIL_WIDTH_PX}px;
          box-sizing: border-box;
          min-height: 100vh;
          border-right: 1px solid var(--color-border, #17130F);
          padding: var(--space-sm, 16px);
        }
        .ml-nav-rail-main { flex: 1 1 auto; min-width: 0; padding-left: var(--space-md, 32px); }
        .ml-nav-rail-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-xs, 8px); }
        @media (max-width: 768px) {
          .ml-nav-rail-shell { flex-direction: column; }
          .ml-nav-rail {
            position: static;
            width: 100%;
            flex: 1 1 auto;
            min-height: 0;
            border-right: none;
            border-bottom: 1px solid var(--color-border, #17130F);
          }
          .ml-nav-rail-links { flex-direction: row; flex-wrap: wrap; }
          .ml-nav-rail-main { padding-left: 0; padding-top: var(--space-sm, 16px); }
        }
      `}</style>
      <nav className="ml-nav-rail" aria-label="Main">
        <a
          href={`/demo/${demoSlug}`}
          style={{
            display: "block",
            fontWeight: 700,
            textDecoration: "none",
            color: "var(--color-primary)",
            marginBottom: "var(--space-sm, 16px)",
            fontSize: "var(--font-size-heading-md, 1.5rem)",
          }}
        >
          {displayName}
        </a>
        <ul className="ml-nav-rail-links">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} style={{ color: "var(--color-primary)" }}>
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <a href={`/demo/${demoSlug}/cart`} style={{ color: "var(--color-primary)" }}>
              Cart
            </a>
          </li>
          <li>
            <a href={`/demo/${demoSlug}/search`} style={{ color: "var(--color-primary)" }}>
              Search
            </a>
          </li>
          <li>
            <a href={`/demo/${demoSlug}/account`} style={{ color: "var(--color-primary)" }}>
              Account
            </a>
          </li>
          <li>
            <a href={`/demo/${demoSlug}/admin/plugins`} style={{ color: "var(--color-primary)" }}>
              Admin: Plugins
            </a>
          </li>
          <li>
            <a href="/" style={{ color: "var(--color-primary)" }}>
              &larr; Mercatus Liber home
            </a>
          </li>
          {otherDemos.map((other) => (
            <li key={other.slug}>
              <a href={`/demo/${other.slug}`} style={{ color: "var(--color-primary)" }}>
                Switch to {other.displayName}
              </a>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: "var(--space-md, 32px)" }}>
          <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
        </div>
      </nav>
      <div className="ml-nav-rail-main">{children}</div>
    </div>
  );
}
