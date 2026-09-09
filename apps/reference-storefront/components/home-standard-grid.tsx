import type { ComponentInstance } from "@mercatus-liber/cms";
import { CmsSection } from "./cms-sections";
import type { DemoSlug } from "../lib/demos";

/**
 * The "home.standard-grid" template -- today's current home-page
 * section-rendering behavior, extracted verbatim (a plain top-to-bottom
 * stack of whatever CMS sections the "home" page has, each rendered by
 * cms-sections.tsx's own per-componentType renderer). Zero visual change
 * from before this story.
 */
export function HomeStandardGrid({ demoSlug, sections }: { demoSlug: DemoSlug; sections: ComponentInstance[] }) {
  return (
    <>
      {sections.map((section, i) => (
        // Sections are an ordered list, not individually id-addressable in this minimal demo -- index is a stable enough key here.
        <CmsSection key={i} demoSlug={demoSlug} section={section} pageSlug="home" />
      ))}
    </>
  );
}
