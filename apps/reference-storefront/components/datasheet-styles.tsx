/**
 * Shared CSS + font-loading for the "datasheet" theme bundle ("Datasheet
 * Storefront" -- precision technical/engineering-blueprint aesthetic).
 *
 * visual-fidelity-datasheet: the original component-template-wiring story
 * (design-system-v2-02) only ever wired STRUCTURAL layout differences via
 * thin `style={{ color: "var(--x)" }}` objects -- it never ported the
 * source mockup's actual rich CSS design language (fonts, borders, shadows,
 * decorative treatment). This file is the real, ported CSS from that
 * mockup, factored out so every datasheet-specific component
 * (nav-blueprint-bar/home-spec-grid/category-spec-grid/cart-spec-table/
 * pdp-spec-sheet) can embed the same base rules in its own <style> tag
 * (per this fix's own convention -- each component stays self-contained,
 * no new runtime dependency) without copy-paste drift between them.
 *
 * Every class name is prefixed `ds-` to guarantee zero collision with the
 * `editorial`/`maximalist` bundles' own components, which other agents are
 * building in parallel against the same shared files. Colors/fonts/radius
 * reuse the real `datasheet` ThemeBundle tokens (packages/theming/src/
 * theme-bundles.ts) via `var(--color-x, <mockup literal fallback>)` --
 * confirmed by inspection that the bundle's own token values are exactly
 * the mockup's hex values (e.g. --color-primary #C8460A === the mockup's
 * --accent), so no new token vocabulary is needed. Values the token
 * vocabulary has no slot for at all (the blueprint dot-grid, hairline
 * card-art grid, corner registration ticks, stock-badge green, dashed
 * panel-title rule) are hardcoded verbatim from the mockup's own CSS.
 */
import type { ReactNode } from "react";

/**
 * Archivo (display) / IBM Plex Sans (body) / IBM Plex Mono (labels, prices,
 * specs) -- ported verbatim from the mockup's own <link> tags. Nothing else
 * in this app loads a webfont today (confirmed by inspection -- every other
 * bundle's `--font-family` value is a system-font stack), so this
 * establishes the pattern rather than following one: rendered inside a
 * component (not a root layout, since datasheet is one theme among ten),
 * relying on Next.js/React 19's built-in hoisting of `<link>` tags rendered
 * anywhere in the tree up into the real document `<head>`.
 */
export function DatasheetFontLinks(): ReactNode {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      />
    </>
  );
}

export const DS_FONT_DISPLAY = "'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const DS_FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

/**
 * Atoms shared across every datasheet component: the monospace/uppercase
 * "label" treatment, the drafting-convention title-block section header,
 * buttons, chips, and the corner "registration tick" decoration -- all
 * ported verbatim from the mockup's `.label`/`.titleblock`/`.btn*`/`.chip`/
 * `.tick` rules. Safe to repeat verbatim in multiple components' <style>
 * tags: plain global CSS, not scoped, so identical re-declarations across
 * mounted components are simply redundant (last one wins, but every copy
 * is byte-identical) rather than conflicting.
 */
export const DS_ATOMS_CSS = `
  .ds-scope { color: var(--color-text, #12151B); }
  .ds-scope, .ds-scope * { box-sizing: border-box; }
  .ds-mono { font-family: ${DS_FONT_MONO}; }
  .ds-label {
    font-family: ${DS_FONT_MONO};
    font-size: 10.5px;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--color-muted, #8891A0);
  }
  .ds-titleblock {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    margin-top: var(--space-md, 24px);
    border-top: 2px solid var(--color-text, #12151B);
    border-bottom: 1px solid var(--color-border, #D2D7E0);
    flex-wrap: wrap;
  }
  .ds-titleblock .ds-name {
    font-family: ${DS_FONT_MONO};
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text, #12151B);
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .ds-titleblock .ds-num { color: var(--color-primary, #C8460A); }
  .ds-titleblock .ds-meta {
    font-family: ${DS_FONT_MONO};
    font-size: 10.5px;
    color: var(--color-muted, #8891A0);
    letter-spacing: 0.06em;
    display: flex;
    gap: 18px;
  }
  .ds-btn {
    font-family: ${DS_FONT_MONO};
    font-size: 11.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 13px 22px;
    border: 1px solid var(--color-text, #12151B);
    background: var(--color-text, #12151B);
    color: var(--color-background, #F1F3F6);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .ds-btn-accent {
    background: var(--color-primary, #C8460A);
    border-color: var(--color-primary, #C8460A);
    color: #FFFFFF;
    font-weight: 600;
  }
  .ds-btn-outline {
    background: transparent;
    color: var(--color-text, #12151B);
    border-color: var(--color-muted, #AAB1BF);
  }
  .ds-btn-block { width: 100%; justify-content: center; }
  .ds-chip {
    font-family: ${DS_FONT_MONO};
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-muted, #8891A0);
    border: 1px solid var(--color-border, #D2D7E0);
    padding: 2px 6px;
    display: inline-block;
  }
  .ds-tick { position: absolute; width: 9px; height: 9px; pointer-events: none; }
  .ds-tick.tl { top: 8px; left: 8px; border-top: 1px solid #AAB1BF; border-left: 1px solid #AAB1BF; }
  .ds-tick.tr { top: 8px; right: 8px; border-top: 1px solid #AAB1BF; border-right: 1px solid #AAB1BF; }
  .ds-stock-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: ${DS_FONT_MONO};
    font-size: 10.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 5px 9px;
    background: #DCEEE3;
    color: #1D7A4C;
    border: 1px solid #1D7A4C;
  }
  .ds-stock-badge.out { background: #F3E1DC; color: var(--color-primary, #C8460A); border-color: var(--color-primary, #C8460A); }
  .ds-stepper { display: inline-flex; align-items: stretch; border: 1px solid var(--color-muted, #AAB1BF); }
  .ds-stepper input {
    width: 52px;
    border: none;
    background: var(--color-background, #E7EAF0);
    color: var(--color-text, #12151B);
    font-family: ${DS_FONT_MONO};
    font-size: 13px;
    text-align: center;
  }
  .ds-stepper button {
    width: 32px;
    background: var(--color-background, #E7EAF0);
    border: none;
    border-left: 1px solid var(--color-muted, #AAB1BF);
    color: var(--color-text, #12151B);
    font-family: ${DS_FONT_MONO};
    cursor: pointer;
  }
  /* Dot-grid "circuit board" background used for decorative art panels
     (product-card art frame, PDP art panel) -- distinct from the page-level
     blueprint background (applied to <body> by nav-blueprint-bar.tsx only,
     since that component is the one always mounted for every datasheet
     page). */
  .ds-dotgrid {
    background-image:
      linear-gradient(rgba(18, 21, 27, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(18, 21, 27, 0.07) 1px, transparent 1px);
    background-size: 14px 14px;
  }
`;
