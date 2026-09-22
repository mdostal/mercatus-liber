import type { ReactNode } from "react";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "./theme-switcher";
import type { DemoSlug } from "../lib/demos";

const RAIL_WIDTH_PX = 240;

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
 *
 * visual-fidelity-maximalist: enriched with the real ported "Blaze Theme"
 * mockup CSS (thick 3px borders, hard offset shadows, the Anton/Space Mono
 * type pairing) -- previously this was the ONLY component with any real
 * theme-specific styling, and even that was thin `style={{ color: "var(...)"
 * }}` objects, not the actual rich design language. `nav.rail` is exclusive
 * to the "maximalist" bundle (no other bundle registers it as its default),
 * so this file can be restyled freely with zero risk to the other 9
 * bundles. `mx-`-prefixed classes throughout per this epic's
 * collision-avoidance convention.
 *
 * cms-demo-scoping-and-nav-cleanup fix: this rail no longer renders
 * "Admin: Plugins" / "<- Mercatus Liber home" / "Switch to {other demo}" --
 * those now render once in the shared secondary utility strip
 * app/demo/[demoSlug]/layout.tsx renders above every NavChrome. The rail's
 * own link list is now purely real shop navigation (categories/
 * service-areas/campaigns via `navLinks`, plus Cart/Search/Account) -- the
 * genuine structured "menu you actually see" the user asked for, without
 * framework/docs links mixed in.
 */
export function NavRail({
  demoSlug,
  displayName,
  navLinks,
  bundles,
  activeThemeKey,
  children,
}: {
  demoSlug: DemoSlug;
  displayName: string;
  navLinks: Array<{ href: string; label: string }>;
  bundles: ThemeBundle[];
  activeThemeKey: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-nav-rail-shell">
      <style>{`
        .mx-nav-rail-shell { display: flex; align-items: flex-start; }
        .mx-nav-rail {
          position: sticky;
          top: 0;
          width: ${RAIL_WIDTH_PX}px;
          flex: 0 0 ${RAIL_WIDTH_PX}px;
          box-sizing: border-box;
          min-height: 100vh;
          background: var(--color-accent, #263B8C);
          border-right: 3px solid var(--color-border, #17130F);
          padding: var(--space-sm, 16px);
          display: flex;
          flex-direction: column;
        }
        .mx-nav-rail-main { flex: 1 1 auto; min-width: 0; padding-left: var(--space-md, 32px); }
        .mx-wordmark {
          display: inline-block;
          font-family: 'Anton', 'Archivo Black', Impact, ui-sans-serif, sans-serif;
          font-size: 22px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          background: var(--color-primary, #FF4515);
          color: var(--color-text, #17130F);
          border: 3px solid var(--color-border, #17130F);
          border-radius: 8px;
          padding: 3px 12px 5px;
          box-shadow: 4px 4px 0 var(--color-border, #17130F);
          text-decoration: none;
          margin-bottom: var(--space-md, 24px);
        }
        .mx-nav-rail-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .mx-nav-rail-links a {
          display: block;
          color: #F3EFE4;
          text-decoration: none;
          font-family: 'Space Mono', ui-monospace, monospace;
          font-weight: 700;
          font-size: 12.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 9px 8px;
          border-radius: 6px;
          border: 2px solid transparent;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .mx-nav-rail-links a:hover {
          background: var(--color-background, #EEF0E6);
          color: var(--color-text, #17130F);
          border-color: var(--color-border, #17130F);
        }
        .mx-nav-rail-links li.mx-rail-divider { border-top: 2px dashed rgba(243,239,228,0.35); margin: 8px 0; }
        .mx-rail-switcher {
          margin-top: var(--space-md, 24px);
          border: 3px solid var(--color-border, #17130F);
          border-radius: 10px;
          background: var(--color-background, #EEF0E6);
          box-shadow: 4px 4px 0 var(--color-border, #17130F);
          padding: 10px;
          font-family: 'Space Mono', ui-monospace, monospace;
          font-size: 12px;
          color: var(--color-text, #17130F);
        }
        @media (max-width: 768px) {
          .mx-nav-rail-shell { flex-direction: column; }
          .mx-nav-rail {
            position: static;
            width: 100%;
            flex: 1 1 auto;
            min-height: 0;
            border-right: none;
            border-bottom: 3px solid var(--color-border, #17130F);
          }
          .mx-nav-rail-links { flex-direction: row; flex-wrap: wrap; }
          .mx-nav-rail-main { padding-left: 0; padding-top: var(--space-sm, 16px); }
        }
      `}</style>
      <nav className="mx-nav-rail" aria-label="Main">
        <a href={`/demo/${demoSlug}`} className="mx-wordmark">
          {displayName}
        </a>
        <ul className="mx-nav-rail-links">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
          <li>
            <a href={`/demo/${demoSlug}/cart`}>Cart</a>
          </li>
          <li>
            <a href={`/demo/${demoSlug}/search`}>Search</a>
          </li>
          <li>
            <a href={`/demo/${demoSlug}/account`}>Account</a>
          </li>
        </ul>
        <div className="mx-rail-switcher">
          <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
        </div>
      </nav>
      <div className="mx-nav-rail-main">{children}</div>
    </div>
  );
}
