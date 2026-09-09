import type { ComponentInstance } from "@mercatus-liber/cms";
import { CmsSection } from "./cms-sections";
import type { DemoSlug } from "../lib/demos";

/**
 * The "home.magazine-grid" template -- asymmetric feature-card layout per
 * "The Slow Catalog" (design-discussion.md §1: "asymmetric magazine-style
 * product grid"). Wraps the exact same CMS section data/rendering as
 * home-standard-grid.tsx -- every section still renders through
 * cms-sections.tsx's own <CmsSection/> switch, never forked or
 * reimplemented here -- only the surrounding layout differs: the first
 * section renders full-width as a large "feature" using the editorial
 * display typeface, the rest fall into a smaller asymmetric card grid
 * below it.
 */
export function HomeMagazineGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  const [feature, ...rest] = sections;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg, 32px)" }}>
      {feature && (
        <div style={{ fontFamily: "var(--font-family-display, var(--font-family))" }}>
          <CmsSection demoSlug={demoSlug} section={feature} pageSlug="home" />
        </div>
      )}
      {rest.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--space-md, 32px)",
          }}
        >
          {rest.map((section, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--color-border, #ddd)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-card, none)",
                padding: "var(--space-sm, 16px)",
              }}
            >
              <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
