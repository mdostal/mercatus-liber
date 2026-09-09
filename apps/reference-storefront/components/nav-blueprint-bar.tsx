import type { ReactNode } from "react";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { DS_FONT_DISPLAY, DS_FONT_MONO } from "./datasheet-styles";
import { ThemeSwitcher } from "./theme-switcher";
import type { DemoSlug } from "../lib/demos";

/**
 * The "nav.blueprint-bar" template -- the real "Datasheet Storefront" nav
 * chrome (design-discussion.md §1's "blueprint dot-grid background,
 * hairline-border grid system"), ported verbatim from the approved mockup's
 * `.storefront-nav`/`.nav-logo`/`.nav-links`/`.nav-search`/`.nav-cart`
 * rules.
 *
 * visual-fidelity-datasheet: `datasheet` previously shared `nav.top-bar`
 * with 7 pre-existing bundles + `editorial` -- the exact "pipe-separated
 * nav, default black links" bug the user flagged. Registering a dedicated
 * template here (same pattern `nav.rail` already established for
 * "maximalist") fixes it with zero risk to `nav.top-bar`'s other 8
 * consumers: nav-top-bar.tsx itself is untouched, and this new component
 * only ever mounts when `datasheet` is the active bundle (see
 * app/demo/[demoSlug]/layout.tsx's NAV_TEMPLATES map + this bundle's own
 * `defaultTemplatesByPageType.nav`).
 *
 * Also the one place the mockup's page-wide "blueprint" dot-grid <body>
 * background gets applied: this component is the outermost chrome always
 * mounted for every datasheet page (it wraps `children` as a sibling, same
 * shape as nav-top-bar.tsx), so its <style> tag's `body { ... }` rule is
 * the real global page background for exactly as long as `datasheet` stays
 * the active theme -- without touching app/demo/[demoSlug]/layout.tsx's
 * shared <body> element itself. (The real Archivo/IBM Plex Sans/IBM Plex
 * Mono Google Fonts load lives in that layout's own <head>, gated on
 * `activeTheme.key === "datasheet"`, matching the isEditorial/isMaximalist
 * pattern already established there -- not duplicated here.)
 */
export function NavBlueprintBar({
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
    <div className="ds-scope">
      <style>{`
        body {
          background-color: var(--color-background, #F1F3F6);
          background-image: radial-gradient(rgba(18, 21, 27, 0.07) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .ds-navbar {
          display: flex;
          align-items: center;
          gap: 0;
          background: #FFFFFF;
          border: 1px solid var(--color-border, #D2D7E0);
          font-family: var(--font-family, 'IBM Plex Sans', sans-serif);
          margin-bottom: var(--space-md, 24px);
        }
        .ds-nav-logo {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 20px;
          height: 56px;
          border-right: 1px solid var(--color-border, #D2D7E0);
          font-family: ${DS_FONT_DISPLAY};
          font-weight: 900;
          font-size: 16px;
          letter-spacing: 0.02em;
          flex-shrink: 0;
          text-decoration: none;
          color: var(--color-text, #12151B);
        }
        .ds-nav-logo .ds-dot { width: 7px; height: 7px; background: var(--color-primary, #C8460A); flex-shrink: 0; display: inline-block; }
        .ds-nav-links {
          display: flex;
          align-items: stretch;
          flex: 1;
          min-width: 0;
          overflow-x: auto;
        }
        .ds-nav-links a {
          display: flex;
          align-items: center;
          padding: 0 18px;
          height: 56px;
          text-decoration: none;
          color: var(--color-accent, #5A6170);
          font-family: ${DS_FONT_MONO};
          font-size: 11.5px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          border-right: 1px solid var(--color-border, #D2D7E0);
          white-space: nowrap;
        }
        .ds-nav-links a:hover { color: var(--color-primary, #C8460A); background: var(--color-background, #E7EAF0); }
        .ds-nav-utility { display: flex; align-items: stretch; flex-shrink: 0; margin-left: auto; }
        .ds-nav-cart {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 18px;
          height: 56px;
          border-left: 1px solid var(--color-border, #D2D7E0);
          text-decoration: none;
          color: var(--color-accent, #5A6170);
          font-family: ${DS_FONT_MONO};
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ds-nav-cart:hover { background: var(--color-background, #E7EAF0); }
        .ds-nav-theme {
          display: flex;
          align-items: center;
          padding: 0 18px;
          height: 56px;
          border-left: 1px solid var(--color-border, #D2D7E0);
          font-family: ${DS_FONT_MONO};
          font-size: 11px;
        }
        .ds-nav-theme select { font-family: ${DS_FONT_MONO}; font-size: 11px; }
      `}</style>
      <nav className="ds-navbar" aria-label="Main">
        <a href={`/demo/${demoSlug}`} className="ds-nav-logo">
          <span className="ds-dot" aria-hidden="true" />
          {displayName}
        </a>
        <div className="ds-nav-links">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <a href={`/demo/${demoSlug}/search`}>Search</a>
          <a href={`/demo/${demoSlug}/account`}>Account</a>
          <a href={`/demo/${demoSlug}/admin/plugins`}>Admin</a>
          <a href="/">&larr; Home</a>
          {otherDemos.map((other) => (
            <a key={other.slug} href={`/demo/${other.slug}`}>
              &rarr; {other.displayName}
            </a>
          ))}
        </div>
        <div className="ds-nav-utility">
          <a href={`/demo/${demoSlug}/cart`} className="ds-nav-cart">
            Cart
          </a>
          <div className="ds-nav-theme">
            <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
