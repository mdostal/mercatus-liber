"use client";

import type { ThemeBundle } from "@mercatus-liber/theming";
import { useRef } from "react";
import { setThemeAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

/**
 * The 3 storefront-design-system-v2 bundles carry real design names (from the
 * source design that was live-verified and published as an Artifact before this
 * epic's planning pass -- see .pHive/epics/storefront-design-system-v2/docs/
 * design-discussion.md §1) that read better than their generic ThemeBundle.label
 * ("Editorial"/"Maximalist"/"Datasheet"). This map is presentation-only sugar
 * over the existing label -- it does not change ThemeBundle.label itself (which
 * stays the short, generic form other call sites/tests already assert on), and
 * it does not add any new persistence path: selecting any option here still
 * just writes bundle.key via the same setThemeAction/theme-cookie mechanism
 * every other bundle already uses.
 */
const DESIGN_NAMES: Partial<Record<string, string>> = {
  editorial: "The Slow Catalog",
  maximalist: "Blaze Theme",
  datasheet: "Datasheet Storefront",
};

export function ThemeSwitcher({
  demoSlug,
  bundles,
  activeKey,
}: {
  demoSlug: DemoSlug;
  bundles: ThemeBundle[];
  activeKey: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={setThemeAction} ref={formRef} className="ts-form">
      <style>{THEME_SWITCHER_CSS}</style>
      <input type="hidden" name="demoSlug" value={demoSlug} />
      <label className="ts-pill">
        <span className="ts-label">Theme</span>
        <select
          className="ts-select"
          name="theme"
          defaultValue={activeKey}
          onChange={() => formRef.current?.requestSubmit()}
        >
          {bundles.map((bundle) => (
            <option key={bundle.key} value={bundle.key}>
              {DESIGN_NAMES[bundle.key] ?? bundle.label} ({bundle.key})
            </option>
          ))}
        </select>
        <svg className="ts-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>
      <noscript>
        <button type="submit" className="ts-apply">
          Apply
        </button>
      </noscript>
    </form>
  );
}

/**
 * theme-switcher-polish: pure CSS/markup pass -- setThemeAction's props and
 * the underlying <select>/onChange auto-submit behavior above are byte-for-
 * byte unchanged. Styled entirely off the ACTIVE theme's own CSS custom
 * properties (var(--color-primary)/--color-border/--color-text/--radius/
 * --font-family, each with a sensible literal fallback for the 6 bundles
 * that don't define the newer --color-border/--color-muted tokens -- see
 * theme-bundles.ts's own doc comment on that gap) so this renders correctly
 * inside all 10 themes, not just one -- this component has no idea which
 * theme is active beyond the CSS variables already in scope from
 * app/demo/[demoSlug]/layout.tsx's `:root { ... }` style tag.
 */
const THEME_SWITCHER_CSS = `
  .ts-form { display: inline-flex; margin-top: 4px; }
  .ts-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    position: relative;
    background: color-mix(in srgb, var(--color-background) 92%, var(--color-text) 8%);
    border: 1px solid var(--color-border, var(--color-muted, currentColor));
    border-radius: calc(var(--radius, 6px) + 4px);
    padding: 5px 10px 5px 12px;
    font-family: var(--font-family, inherit);
    font-size: 0.78rem;
    cursor: pointer;
  }
  .ts-label {
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted, var(--color-text));
    /* a11y-audit: opacity: 0.75 used to sit on top of var(--color-muted, ...),
       silently compositing the already-muted token further toward the page
       background -- confirmed live via axe-core on maximalist's own
       --color-muted (#55503f, a real 7.00:1 AA pass on its own) rendering at
       an effective #7b7869/3.85:1 once 0.75 opacity was applied, a real AA
       fail (needs 4.5:1). Removing the opacity can only ever increase (never
       reduce) contrast against the background for every bundle -- the muted
       color choice itself already provides the "de-emphasized" visual
       effect this opacity was redundantly layering on top of. */
  }
  .ts-select {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 2px 18px 2px 2px;
    cursor: pointer;
  }
  .ts-select:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  .ts-chevron { position: absolute; right: 9px; width: 12px; height: 12px; color: var(--color-muted, var(--color-text)); pointer-events: none; }
  .ts-apply { margin-left: 6px; font-family: inherit; font-size: 0.78rem; }
`;
