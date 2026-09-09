import type { ComponentInstance } from "@mercatus-liber/cms";
import { CmsSection } from "./cms-sections";
import type { DemoSlug } from "../lib/demos";

/**
 * The "home.spec-grid" template -- dense datasheet-style grid per
 * "Datasheet Storefront" (design-discussion.md §1: "hairline-border grid
 * system (borders *as* the grid, no card shadows)"). Wraps the exact same
 * CMS section data/rendering as home-standard-grid.tsx -- only the
 * surrounding layout differs: sections tile into a dense multi-column grid
 * whose 1px gaps are filled with the border token color, so the borders
 * themselves form the grid lines instead of individual card shadows.
 */
export function HomeSpecGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 1,
        background: "var(--color-border, #ddd)",
        border: "1px solid var(--color-border, #ddd)",
      }}
    >
      {sections.map((section, i) => (
        <div key={i} style={{ background: "var(--color-background)", padding: "var(--space-xs, 8px)" }}>
          <CmsSection demoSlug={demoSlug} section={section} pageSlug="home" />
        </div>
      ))}
    </div>
  );
}
