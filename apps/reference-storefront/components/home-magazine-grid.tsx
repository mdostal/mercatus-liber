import type { ComponentInstance } from "@mercatus-liber/cms";
import { CmsSection } from "./cms-sections";
import type { DemoSlug } from "../lib/demos";

/**
 * The "home.magazine-grid" template -- asymmetric feature-card layout per
 * "The Slow Catalog" (design-discussion.md §1: "asymmetric magazine-style
 * product grid"), now ported with the real visual language from the
 * approved design mockup (Fraunces/Newsreader/Libre Franklin type, warm
 * palette, hairline borders, card-lift hover, and the mockup's own
 * `.catalog-grid` 3-column `grid-template-areas` for the "feature + b/c/d/e"
 * layout) instead of only structural placeholder styling. Wraps the exact
 * same CMS section data/rendering as home-standard-grid.tsx -- every
 * section still renders through cms-sections.tsx's own <CmsSection/>
 * switch, never forked or reimplemented here -- only the surrounding
 * layout/decoration differs. This template is only ever selected by the
 * "editorial" bundle (no other bundle registers "home.magazine-grid"), so
 * every class/style below is safe to apply unconditionally.
 */
export function HomeMagazineGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  const [feature, ...rest] = sections;
  const areas = magazineAreas(rest.length);
  const overflow = rest.slice(5);
  const gridItems = rest.slice(0, 5);

  return (
    <div className="ed-home">
      <style>{`
        .ed-home .ed-hero-feature { padding: 2.5rem 0 3rem; border-bottom: 1px solid var(--color-border, #C7B586); margin-bottom: 2.5rem; }
        .ed-home .ed-hero-feature h1 { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: clamp(2.1rem, 4vw, 3.2rem); line-height: 1.05; }
        .ed-home .ed-hero-feature p { font-family: var(--font-family); font-size: 1.1rem; line-height: 1.6; color: var(--color-muted, #55493A); max-width: 52ch; margin-top: .9rem !important; }
        .ed-catalog-grid { display: grid; gap: 1.5rem; grid-template-columns: ${areas.columns}; grid-template-areas: ${areas.template}; margin-bottom: 2rem; }
        .ed-catalog-grid .ed-card { background: var(--color-surface, #FBF6E9); border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); padding: 1.25rem; transition: transform .18s ease, box-shadow .18s ease; box-shadow: var(--shadow-card, none); }
        .ed-catalog-grid .ed-card:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(36,28,20,.35); }
        .ed-catalog-grid .ed-card-feature { grid-area: feature; padding: 1.75rem; }
        .ed-catalog-grid .ed-card-feature h1, .ed-catalog-grid .ed-card-feature h2 { font-family: var(--font-family-display, var(--font-family)); font-size: 1.55rem; }
        .ed-overflow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
        @media (max-width: 780px) {
          .ed-catalog-grid { grid-template-columns: 1fr; grid-template-areas: "feature" "b" "c" "d" "e"; }
        }
      `}</style>

      {feature && (
        <div className="ed-hero-feature">
          <CmsSection demoSlug={demoSlug} section={feature} pageSlug="home" />
        </div>
      )}

      {gridItems.length > 0 && (
        <div className="ed-catalog-grid">
          {gridItems.map((section, i) => (
            <div key={i} className={`ed-card${i === 0 ? " ed-card-feature" : ""}`} style={{ gridArea: AREA_NAMES[i] }}>
              <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
            </div>
          ))}
        </div>
      )}

      {overflow.length > 0 && (
        <div className="ed-overflow-grid">
          {overflow.map((section, i) => (
            <div key={i} className="ed-card">
              <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AREA_NAMES = ["feature", "b", "c", "d", "e"] as const;

/**
 * Computes a `grid-template-areas`/`grid-template-columns` pair matching the
 * design mockup's `.catalog-grid` ("feature b c" / "feature d e", a
 * 1.55fr:1fr:1fr 3-column asymmetric layout) for however many items this
 * page type actually has (real CMS-authored home pages here run 1-3
 * sections after the hero, not always the mockup's illustrative 5) -- a
 * count this component can't control, so the layout degrades gracefully
 * instead of leaving empty grid cells.
 */
function magazineAreas(count: number): { template: string; columns: string } {
  const columns = "1.55fr 1fr 1fr";
  if (count <= 1) return { template: `"feature feature feature"`, columns };
  if (count === 2) return { template: `"feature b b"`, columns };
  return { template: `"feature b c" "feature d e"`, columns };
}
