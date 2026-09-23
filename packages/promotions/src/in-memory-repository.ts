import type { Promotion, PromotionRepository } from "./types.js";

/**
 * Default in-memory PromotionRepository -- structured exactly like the
 * cart subsystem's own in-memory repository (Map-backed, structuredClone
 * in/out so callers can never mutate stored state through a returned
 * reference). A durable adapter (e.g. sqlite) is a later, separate concern --
 * not required for this reference default.
 */
export function createInMemoryPromotionRepository(): PromotionRepository {
  const promotions = new Map<string, Promotion>();
  return {
    async get(id: string): Promise<Promotion | null> {
      const promotion = promotions.get(id);
      return promotion ? structuredClone(promotion) : null;
    },
    async list(filter?: { demoSlug?: string }): Promise<Promotion[]> {
      const all = Array.from(promotions.values());
      const filtered = filter?.demoSlug ? all.filter((promotion) => promotion.demoSlug === filter.demoSlug) : all;
      return filtered.map((promotion) => structuredClone(promotion));
    },
    async save(promotion: Promotion): Promise<void> {
      promotions.set(promotion.id, structuredClone(promotion));
    },
  };
}
