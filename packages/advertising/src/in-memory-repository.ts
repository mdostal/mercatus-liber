import type { Campaign, CampaignRepository } from "./types.js";

/**
 * Default in-memory CampaignRepository -- structured exactly like
 * recommendations/bundles/cart/promotions' own in-memory repositories
 * (Map-backed, structuredClone in/out so callers can never mutate stored
 * state through a returned reference). A durable adapter (e.g. sqlite) is a
 * later, separate concern -- not required for this reference default.
 */
export function createInMemoryCampaignRepository(): CampaignRepository {
  const campaigns = new Map<string, Campaign>();
  return {
    async get(id: string): Promise<Campaign | null> {
      const campaign = campaigns.get(id);
      return campaign ? structuredClone(campaign) : null;
    },
    async list(filter?: { demoSlug?: string }): Promise<Campaign[]> {
      const all = Array.from(campaigns.values());
      const filtered = filter?.demoSlug ? all.filter((campaign) => campaign.demoSlug === filter.demoSlug) : all;
      return filtered.map((campaign) => structuredClone(campaign));
    },
    async save(campaign: Campaign): Promise<void> {
      campaigns.set(campaign.id, structuredClone(campaign));
    },
  };
}
