import type { ComponentDefinition, ComponentRegistry } from "./types.js";

/** The founder's spec: hero banner, ad slots, category spots (home page), plus product grid (reused by category/marketing/search pages). */
export const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  { type: "hero-banner", label: "Hero Banner", description: "A large top-of-page banner with image/copy/link." },
  { type: "ad-slot", label: "Ad Slot", description: "A promotional placement." },
  { type: "category-spot", label: "Category Spot", description: "A featured-category tile linking to a category page." },
  { type: "product-grid", label: "Product Grid", description: "A grid of products -- reused across category/marketing/search pages." },
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
