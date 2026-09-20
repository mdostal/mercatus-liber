import type { ComponentDefinition, ComponentRegistry } from "./types.js";

/**
 * fields[] on every entry below is grounded in real seed data only -- every
 * key + kind here is backed by an actual config usage in
 * apps/reference-storefront/lib/seed.ts, seed-northline.ts, or
 * seed-broadleaf.ts (see that story's PR/commit for the grep evidence).
 * Nothing here is invented ahead of real usage.
 */
export const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  {
    type: "hero-banner",
    label: "Hero Banner",
    description: "A large top-of-page banner with image/copy/link.",
    fields: [
      { key: "headline", label: "Headline", kind: "text", required: true },
      { key: "subheadline", label: "Subheadline", kind: "text" },
    ],
  },
  {
    type: "ad-slot",
    label: "Ad Slot",
    description: "A promotional placement.",
    // Deliberately empty: every real seed usage passes config: {} -- the
    // slot's actual content (headline/body/image/link) is resolved at
    // render time from the advertising service by page-slug/service-area
    // targeting (see components/cms-sections.tsx's AdSlot), never stored on
    // the CMS component's own config. No field belongs here until that
    // changes.
    fields: [],
  },
  {
    type: "category-spot",
    label: "Category Spot",
    description: "A featured-category tile linking to a category page.",
    fields: [
      {
        key: "categorySlugs",
        label: "Categories",
        kind: "categoryRef",
        required: true,
        helpText: "One or more category slugs to feature (an array of category references).",
      },
    ],
  },
  {
    type: "product-grid",
    label: "Product Grid",
    description: "A grid of products -- reused across category/marketing/search pages.",
    fields: [
      {
        key: "productIds",
        label: "Products",
        kind: "productRef",
        required: true,
        helpText: "Ordered array of product ids to display.",
      },
    ],
  },
  {
    type: "service-area-info",
    label: "Service Area Info",
    description:
      "Contact/hours/local marketing copy for a location page (subsystem 15) -- the structured phone/name/region live on the ServiceArea entity itself, this component is for richer authored content.",
    fields: [
      { key: "hours", label: "Hours", kind: "text", required: true },
      { key: "blurb", label: "Blurb", kind: "text", helpText: "Short local marketing copy for this service area." },
      {
        key: "servicesOffered",
        label: "Services Offered",
        kind: "text",
        helpText: "Array of service titles offered at this location.",
      },
    ],
  },
];

export function createComponentRegistry(initial: ComponentDefinition[] = DEFAULT_COMPONENTS): ComponentRegistry {
  const definitions = new Map<string, ComponentDefinition>();
  for (const def of initial) definitions.set(def.type, def);

  return {
    register(definition) {
      definitions.set(definition.type, definition);
    },
    list() {
      return [...definitions.values()];
    },
    get(type) {
      return definitions.get(type) ?? null;
    },
  };
}
