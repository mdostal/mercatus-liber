import type { ReactNode } from "react";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { ThemeSwitcher } from "./theme-switcher";
import type { DemoSlug } from "../lib/demos";

/**
 * The "nav.top-bar" template -- today's only current chrome layout
 * (standard horizontal top navigation bar), extracted verbatim from
 * app/demo/[demoSlug]/layout.tsx into its own component so it can compete
 * with nav-rail.tsx as a real registered template. This is a SHARED
 * fallback: every bundle that doesn't register its own "nav" template
 * (classic/dark/minimal/vibrant/retro/high-contrast/northline/datasheet --
 * 8 of the 9 bundles) resolves to this component, plus "editorial" itself,
 * which explicitly selects it.
 *
 * Because it's shared, the rich "The Slow Catalog" visual treatment below
 * is gated on `activeThemeKey === "editorial"` -- every other bundle
 * renders the exact original plain markup, byte-for-byte, so this file's
 * visual-fidelity work can never regress the 8 bundles that merely fall
 * back to this same component.
 *
 * cms-demo-scoping-and-nav-cleanup fix: this template no longer renders
 * "Admin: Plugins" / "<- Mercatus Liber home" / "Switch to {other demo}" --
 * those cross-demo/framework links now render exactly once, in the shared
 * secondary utility strip app/demo/[demoSlug]/layout.tsx already renders
 * above every NavChrome (see that file's own doc comment). This nav is now
 * purely real shop navigation: categories/service-areas/campaigns
 * (`navLinks`) plus Cart/Search/Account.
 */
export function NavTopBar({
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
  if (activeThemeKey === "editorial") {
    return (
      <EditorialNavTopBar
        demoSlug={demoSlug}
        displayName={displayName}
        navLinks={navLinks}
        bundles={bundles}
        activeThemeKey={activeThemeKey}
      >
        {children}
      </EditorialNavTopBar>
    );
  }

  return (
    <>
      {/* a11y-audit: /admin pages nest a second <header> (admin/layout.tsx's own
          "Signed in as..." bar) alongside this one -- neither is inside
          main/article/aside/section, so both get the implicit ARIA "banner" role.
          Confirmed live via axe-core: "more than one banner landmark" +
          "landmarks must be distinguishable". aria-label names this one so both
          banners (this + admin/layout.tsx's own "Admin session") are unique. */}
      <header
        aria-label="Store navigation"
        style={{ marginBottom: 24, borderBottom: "1px solid var(--color-accent)", paddingBottom: 12 }}
      >
        {/* brand-primary-foreground-contrast-audit (a11y-audit finding #17): raw
            --color-primary confirmed live at 2.64:1 on vibrant (and by
            calculation 2.98:1 on retro) against --color-background here --
            var(--color-primary-text, var(--color-primary)) is a no-op for the
            5 bundles that don't define the new token (already pass) and a
            real AA fix for vibrant/retro. */}
        <a href={`/demo/${demoSlug}`} style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-primary-text, var(--color-primary))" }}>
          {displayName}
        </a>
        {navLinks.map((link) => (
          <span key={link.href}>
            {" · "}
            <a href={link.href} style={{ color: "var(--color-primary-text, var(--color-primary))" }}>
              {link.label}
            </a>
          </span>
        ))}
        {" · "}
        <a href={`/demo/${demoSlug}/cart`} style={{ color: "var(--color-primary-text, var(--color-primary))" }}>
          Cart
        </a>
        {" · "}
        <a href={`/demo/${demoSlug}/search`} style={{ color: "var(--color-primary-text, var(--color-primary))" }}>
          Search
        </a>
        {" · "}
        <a href={`/demo/${demoSlug}/account`} style={{ color: "var(--color-primary-text, var(--color-primary))" }}>
          Account
        </a>

        <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
      </header>
      {children}
    </>
  );
}

/**
 * "The Slow Catalog"'s real nav chrome -- ported from the approved design
 * mockup's `.site-nav`/`.nav-inner`/`.mark`/`.nav-links` CSS (sticky top
 * bar, hairline bottom border, underline-sweep link hover). Same real
 * links/data as the plain branch above (never a different navigation
 * model) -- primary category/campaign links get the mockup's underline
 * treatment; the remaining utility links (cart/admin/demo-switch/theme
 * switcher) sit in a smaller secondary row, since this nav genuinely has
 * more real functional links than the mockup's illustrative 4-link example.
 * All class names are `ed-` prefixed per this epic's cross-theme collision
 * rule.
 */
function EditorialNavTopBar({
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
    <>
      <style>{`
        .ed-nav { position: sticky; top: 0; z-index: 40; background: var(--color-background); border-bottom: 1px solid var(--color-border, #C7B586); margin: 0 -1.5rem 2rem; }
        .ed-nav-inner { display: flex; align-items: center; gap: 2rem; padding: 1rem 1.5rem; flex-wrap: wrap; }
        .ed-mark { display: flex; align-items: center; gap: .55rem; flex-shrink: 0; text-decoration: none; }
        .ed-mark svg { width: 20px; height: 20px; color: var(--color-primary); }
        .ed-mark span { font-family: var(--font-family-display, var(--font-family)); font-weight: 700; font-size: 1.15rem; color: var(--color-text); letter-spacing: .01em; }
        .ed-nav-links { display: flex; gap: 1.5rem; flex: 1 1 auto; font-family: var(--font-family); font-size: .86rem; font-weight: 600; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
        .ed-nav-links a { color: var(--color-muted, #55493A); text-decoration: none; position: relative; padding-bottom: .2rem; display: inline-block; }
        .ed-nav-links a:hover { color: var(--color-text); }
        .ed-nav-links a::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px; background: var(--color-primary); transform: scaleX(0); transform-origin: left; transition: transform .2s ease; }
        .ed-nav-links a:hover::after { transform: scaleX(1); }
        .ed-nav-actions { display: flex; align-items: center; gap: 1.1rem; font-family: var(--font-family); font-size: .78rem; font-weight: 600; }
        .ed-nav-actions a { color: var(--color-muted, #55493A); text-decoration: none; }
        .ed-nav-actions a:hover { color: var(--color-primary-text, var(--color-primary)); }
      `}</style>
      {/* a11y-audit: same duplicate-banner reasoning as the plain header above --
          see that comment for the full writeup. */}
      <header className="ed-nav" aria-label="Store navigation">
        <div className="ed-nav-inner">
          <a className="ed-mark" href={`/demo/${demoSlug}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 4.5C4 3.7 4.7 3 5.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5v-15Z" />
              <path d="M4 19.5C4 18.7 4.7 18 5.5 18H19" />
            </svg>
            <span>{displayName}</span>
          </a>
          <ul className="ed-nav-links">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <a href={`/demo/${demoSlug}/search`}>Search</a>
            </li>
            <li>
              <a href={`/demo/${demoSlug}/account`}>Account</a>
            </li>
          </ul>
          <div className="ed-nav-actions">
            <a href={`/demo/${demoSlug}/cart`}>Cart</a>
            <ThemeSwitcher demoSlug={demoSlug} bundles={bundles} activeKey={activeThemeKey} />
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
