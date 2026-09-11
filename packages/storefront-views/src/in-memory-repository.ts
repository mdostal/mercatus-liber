import type { StorefrontView, StorefrontViewRepository } from "./types.js";

/**
 * Default in-memory StorefrontViewRepository -- Map-backed, structuredClone
 * in/out so callers can never mutate stored state through a returned
 * reference, the same convention as @mercatus-liber/promotions/reviews's
 * own in-memory repositories.
 */
export function createInMemoryStorefrontViewRepository(): StorefrontViewRepository {
  const views = new Map<string, StorefrontView>();

  return {
    async get(id: string): Promise<StorefrontView | null> {
      const view = views.get(id);
      return view ? structuredClone(view) : null;
    },
    async getBySlug(demoSlug: string, slug: string): Promise<StorefrontView | null> {
      const found = Array.from(views.values()).find((view) => view.demoSlug === demoSlug && view.slug === slug);
      return found ? structuredClone(found) : null;
    },
    async listByDemoSlug(demoSlug: string): Promise<StorefrontView[]> {
      return Array.from(views.values())
        .filter((view) => view.demoSlug === demoSlug)
        .map((view) => structuredClone(view));
    },
    async save(view: StorefrontView): Promise<void> {
      views.set(view.id, structuredClone(view));
    },
  };
}
