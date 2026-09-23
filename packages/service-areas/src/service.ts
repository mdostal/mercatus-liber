import { randomUUID } from "node:crypto";
import { ServiceAreaNotFoundError } from "./types.js";
import type { ServiceArea, ServiceAreaProductRepository, ServiceAreaRepository } from "./types.js";

export interface NewServiceAreaInput {
  slug: string;
  name: string;
  region: string;
  description: string;
  phone: string | null;
  /** See `ServiceArea.demoSlug`'s doc comment in types.ts for why this exists. */
  demoSlug?: string;
}

export interface ServiceAreaService {
  createServiceArea(input: NewServiceAreaInput): Promise<ServiceArea>;
  getServiceArea(id: string): Promise<ServiceArea | null>;
  getServiceAreaBySlug(slug: string): Promise<ServiceArea | null>;
  listServiceAreas(filter?: { demoSlug?: string }): Promise<ServiceArea[]>;

  assignProductToServiceArea(productId: string, serviceAreaId: string): Promise<void>;
  unassignProductFromServiceArea(productId: string, serviceAreaId: string): Promise<void>;
  listServiceAreasForProduct(productId: string): Promise<ServiceArea[]>;
  listProductIdsInServiceArea(serviceAreaId: string): Promise<string[]>;
}

export function createServiceAreaService(deps: {
  areas: ServiceAreaRepository;
  assignments: ServiceAreaProductRepository;
}): ServiceAreaService {
  const { areas, assignments } = deps;

  async function requireArea(id: string): Promise<ServiceArea> {
    const area = await areas.get(id);
    if (!area) throw new ServiceAreaNotFoundError(id);
    return area;
  }

  return {
    async createServiceArea(input) {
      const area: ServiceArea = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        region: input.region,
        description: input.description,
        phone: input.phone,
        ...(input.demoSlug !== undefined ? { demoSlug: input.demoSlug } : {}),
      };
      await areas.save(area);
      return area;
    },

    async getServiceArea(id) {
      return areas.get(id);
    },

    async getServiceAreaBySlug(slug) {
      return areas.getBySlug(slug);
    },

    async listServiceAreas(filter) {
      return areas.list(filter);
    },

    async assignProductToServiceArea(productId, serviceAreaId) {
      await requireArea(serviceAreaId);
      await assignments.assign(productId, serviceAreaId);
    },

    async unassignProductFromServiceArea(productId, serviceAreaId) {
      await assignments.unassign(productId, serviceAreaId);
    },

    async listServiceAreasForProduct(productId) {
      const areaIds = await assignments.listServiceAreaIdsForProduct(productId);
      const found = await Promise.all(areaIds.map((id) => areas.get(id)));
      return found.filter((a): a is ServiceArea => a !== null);
    },

    async listProductIdsInServiceArea(serviceAreaId) {
      return assignments.listProductIdsInServiceArea(serviceAreaId);
    },
  };
}
