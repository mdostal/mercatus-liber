import type { ComponentInstance } from "@mercatus-liber/cms";
import { CmsSection } from "./cms-sections";
import { DS_ATOMS_CSS } from "./datasheet-styles";
import type { DemoSlug } from "../lib/demos";

/**
 * The "home.spec-grid" template -- the real "Datasheet Storefront" home
 * page, ported from the approved mockup's `.hero`/`.product-grid`/`.p-card`
 * rules (design-discussion.md §1: "hairline-border grid system (borders
 * *as* the grid, no card shadows)").
 *
 * visual-fidelity-datasheet: the pre-fix version of this file only ever
 * wired the STRUCTURAL grid arrangement (a bare `display:grid` with a
 * 1px-gap/border-color background trick) -- real, but with none of the
 * mockup's actual design language (fonts, title-block section headers,
 * corner registration ticks, dot-grid card art). This version ports that
 * real CSS while wrapping the exact same real CMS section data/rendering
 * as before (`<CmsSection>` per `sections[]` entry, same real per-demo
 * product/category/hero data) -- only the surrounding visual treatment
 * changes, not what data renders.
 *
 * `!important` on the `.ds-home :is(ul, li)` overrides below is
 * deliberate: `CmsSection`'s own `ProductGrid`/`CategorySpot` subcomponents
 * (components/cms-sections.tsx, shared by every bundle -- left untouched
 * here per this fix's "only ADD to shared files" constraint) apply their
 * card treatment via inline `style` attributes, which always win over
 * external stylesheet specificity short of `!important`. Scoped under
 * `.ds-scope`/`.ds-home`, which only exists in the DOM when this template
 * is mounted (i.e. only for the `datasheet` bundle), so this can never
 * affect any other bundle's use of the same shared `CmsSection`.
 */
export function HomeSpecGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  const sectionLabel = (componentType: string): string => componentType.toUpperCase().replace(/-/g, " ");

  return (
    <div className="ds-scope ds-home">
      <style>{DS_ATOMS_CSS}</style>
      <style>{`
        .ds-home-hero {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        /* brand-primary-foreground-contrast-audit (a11y-audit finding #17):
           datasheet's raw --color-primary measures 4.356:1 against
           --color-background -- found by this epic's own required full
           10-bundle re-verification. ".ds-home h1 em" below is left
           untouched: it's a large (clamp 26-42px), 900-weight heading word,
           already past the WCAG large-text 3:1 threshold at the original
           4.356:1. */
        .ds-home-eyebrow {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--color-primary-text, var(--color-primary, #C8460A));
        }
        .ds-home-eyebrow .ds-dot { width: 7px; height: 7px; background: var(--color-primary, #C8460A); flex-shrink: 0; }
        .ds-home h1 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: clamp(26px, 4vw, 42px);
          font-weight: 900;
          line-height: 1.05;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          margin: 6px 0 0;
        }
        .ds-home h1 em { color: var(--color-primary, #C8460A); font-style: normal; }
        .ds-section-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1px;
          background: var(--color-border, #D2D7E0);
          border: 1px solid var(--color-border, #D2D7E0);
        }
        .ds-section-cell {
          background: #FFFFFF;
          padding: var(--space-sm, 16px);
          position: relative;
        }
        .ds-home :is(ul) {
          display: grid !important;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
          gap: 1px !important;
          background: var(--color-border, #D2D7E0) !important;
          border: 1px solid var(--color-border, #D2D7E0) !important;
          padding: 0 !important;
        }
        .ds-home :is(li) {
          background: #FFFFFF !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: var(--space-xs, 8px) !important;
          font-family: var(--font-family, sans-serif);
        }
        .ds-home :is(li) a {
          font-family: ${"'IBM Plex Mono', monospace"};
          font-size: 12px;
          letter-spacing: 0.03em;
        }
      `}</style>

      <div className="ds-home-hero">
        <div>
          <div className="ds-home-eyebrow">
            <span className="ds-dot" aria-hidden="true" />
            <span className="ds-label">Rev. 1.0 -- Live Catalog</span>
          </div>
          <h1>
            Precision parts, <em>documented</em>.
          </h1>
        </div>
        <span className="ds-label">{sections.length.toString().padStart(2, "0")} sections loaded</span>
      </div>

      {sections.map((section, i) => (
        <div key={i}>
          <div className="ds-titleblock">
            <span className="ds-name">
              <span className="ds-num">{`SEC-${String(i + 1).padStart(2, "0")}`}</span>
              {sectionLabel(section.componentType)}
            </span>
            <span className="ds-meta">
              <span>TYPE: {section.componentType}</span>
            </span>
          </div>
          <div className="ds-section-cell">
            <span className="ds-tick tl" aria-hidden="true" />
            <span className="ds-tick tr" aria-hidden="true" />
            <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
          </div>
        </div>
      ))}
    </div>
  );
}
