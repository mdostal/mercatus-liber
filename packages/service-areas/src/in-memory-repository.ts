import type { ServiceArea, ServiceAreaProductRepository, ServiceAreaRepository } from "./types.js";

export function createInMemoryServiceAreaRepository(): ServiceAreaRepository {
  const areas = new Map<string, ServiceArea>();
  return {
    async get(id) {
      const a = areas.get(id);
      return a ? structuredClone(a) : null;
    },
    async getBySlug(slug) {
      for (const a of areas.values()) {
        if (a.slug === slug) return structuredClone(a);
      }
      return null;
    },
    async list() {
      return [...areas.values()].map((a) => structuredClone(a));
    },
    async save(area) {
      areas.set(area.id, structuredClone(area));
    },
  };
}

export function createInMemoryServiceAreaProductRepository(): ServiceAreaProductRepository {
  // Set of "productId::serviceAreaId" pairs.
  const assignments = new Set<string>();
  const key = (productId: string, serviceAreaId: string) => `${productId}::${serviceAreaId}`;

  return {
    async listServiceAreaIdsForProduct(productId) {
      return [...assignments]
        .filter((k) => k.startsWith(`${productId}::`))
        .map((k) => k.slice(productId.length + 2));
    },
    async listProductIdsInServiceArea(serviceAreaId) {
      const suffix = `::${serviceAreaId}`;
      return [...assignments].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    },
    async assign(productId, serviceAreaId) {
      assignments.add(key(productId, serviceAreaId));
    },
    async unassign(productId, serviceAreaId) {
      assignments.delete(key(productId, serviceAreaId));
    },
  };
}
