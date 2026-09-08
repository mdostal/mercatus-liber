import { randomUUID } from "node:crypto";
import type { Campaign, CampaignRepository, CreateCampaignInput, Creative } from "./types.js";

/** Input to AdvertisingService.getActiveCreativeForSlot. All fields optional -- an untargeted, dateless call matches every untargeted, active campaign. */
export interface GetActiveCreativeForSlotInput {
  pageSlug?: string;
  serviceAreaId?: string;
  /** Defaults to `new Date()`. Injectable so date-range eligibility is deterministically testable. */
  now?: Date;
  /** Defaults to `Math.random`. Injectable so the weighted-random pick is deterministically testable -- see design-discussion.md §3. */
  random?: () => number;
}

/** The winning creative for a slot, paired with the campaign it belongs to (e.g. for admin/analytics attribution). */
export interface ActiveCreativeResult {
  campaign: Campaign;
  creative: Creative;
}

export interface AdvertisingService {
  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  listCampaigns(): Promise<Campaign[]>;
  /** Merges the given fields into an existing campaign; null if no campaign has this id. Id is never overwritten. Re-validates the merged campaign exactly as createCampaign does. */
  updateCampaign(id: string, input: Partial<CreateCampaignInput>): Promise<Campaign | null>;
  deactivateCampaign(id: string): Promise<Campaign | null>;
  /**
   * Resolves every currently-eligible campaign for the given slot (active
   * status, within startsAt/endsAt, targeting matches or is wildcard),
   * flattens their creatives into one list, and does a stateless
   * weighted-random pick among them -- computed fresh on every call, no
   * persisted rotation state. Returns null (not an error) when nothing is
   * eligible.
   */
  getActiveCreativeForSlot(input: GetActiveCreativeForSlotInput): Promise<ActiveCreativeResult | null>;
}

/**
 * Normalizes a CreateCampaignInput's creatives into full Creative records:
 * a creative's weight defaults to 1 when not specified (undefined) at
 * creation/update time. Explicit non-positive weights are left as-is here
 * -- getActiveCreativeForSlot's selection math is the layer that
 * defensively treats weight <= 0 (or missing, for data written outside
 * this service) as 1, per design-discussion.md §3.
 */
function normalizeCreatives(creatives: CreateCampaignInput["creatives"]): Creative[] {
  return creatives.map((creative) => ({ ...creative, weight: creative.weight ?? 1 }));
}

/**
 * Validates the write-time rules shared by createCampaign and
 * updateCampaign so the two never drift: at least one creative, and no
 * creative may have an empty linkHref. Deliberately does NOT validate
 * targeting.serviceAreaId/pageSlug against any other subsystem -- see
 * design-discussion.md §3 and docs/subsystems/19-advertising.md's open
 * question 1.
 */
function validateCampaign(campaign: Pick<Campaign, "creatives">): void {
  if (campaign.creatives.length === 0) {
    throw new Error("A campaign must have at least one creative");
  }
  for (const creative of campaign.creatives) {
    if (creative.linkHref.trim() === "") {
      throw new Error(`Creative "${creative.id}" must have a non-empty linkHref`);
    }
  }
}

/**
 * A campaign is eligible for a given slot when: status is "active"; now
 * falls within [startsAt, endsAt] (either bound null = unbounded on that
 * side); and both targeting dimensions either are null (wildcard, matches
 * anything) or exactly match the slot's corresponding input field. See
 * design-discussion.md §3.
 */
function isEligible(
  campaign: Campaign,
  input: { pageSlug: string | undefined; serviceAreaId: string | undefined; now: Date },
): boolean {
  if (campaign.status !== "active") return false;
  if (campaign.startsAt !== null && new Date(campaign.startsAt).getTime() > input.now.getTime()) {
    return false;
  }
  if (campaign.endsAt !== null && new Date(campaign.endsAt).getTime() < input.now.getTime()) {
    return false;
  }
  if (campaign.targeting.serviceAreaId !== null && campaign.targeting.serviceAreaId !== input.serviceAreaId) {
    return false;
  }
  if (campaign.targeting.pageSlug !== null && campaign.targeting.pageSlug !== input.pageSlug) {
    return false;
  }
  return true;
}

/** Treats a non-positive or missing weight as 1, per design-discussion.md §3. */
function effectiveWeight(creative: Creative): number {
  return typeof creative.weight === "number" && creative.weight > 0 ? creative.weight : 1;
}

export function createAdvertisingService(deps: { repository: CampaignRepository }): AdvertisingService {
  const { repository } = deps;

  return {
    async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
      const campaign: Campaign = {
        ...input,
        creatives: normalizeCreatives(input.creatives),
        id: randomUUID(),
        status: input.status ?? "active",
      };
      validateCampaign(campaign);
      await repository.save(campaign);
      return campaign;
    },

    async getCampaign(id: string): Promise<Campaign | null> {
      return repository.get(id);
    },

    async listCampaigns(): Promise<Campaign[]> {
      return repository.list();
    },

    async updateCampaign(id: string, input: Partial<CreateCampaignInput>): Promise<Campaign | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Campaign = {
        ...existing,
        ...input,
        creatives: input.creatives ? normalizeCreatives(input.creatives) : existing.creatives,
        id: existing.id,
      };
      validateCampaign(updated);
      await repository.save(updated);
      return updated;
    },

    async deactivateCampaign(id: string): Promise<Campaign | null> {
      const campaign = await repository.get(id);
      if (!campaign) return null;
      const deactivated: Campaign = { ...campaign, status: "inactive" };
      await repository.save(deactivated);
      return deactivated;
    },

    async getActiveCreativeForSlot(input: GetActiveCreativeForSlotInput): Promise<ActiveCreativeResult | null> {
      const now = input.now ?? new Date();
      const random = input.random ?? Math.random;

      const campaigns = await repository.list();
      const eligibleCampaigns = campaigns.filter((campaign) =>
        isEligible(campaign, { pageSlug: input.pageSlug, serviceAreaId: input.serviceAreaId, now }),
      );

      const entries: ActiveCreativeResult[] = eligibleCampaigns.flatMap((campaign) =>
        campaign.creatives.map((creative) => ({ campaign, creative })),
      );
      if (entries.length === 0) return null;

      const weights = entries.map((entry) => effectiveWeight(entry.creative));
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const point = random() * totalWeight;

      let cumulative = 0;
      for (let i = 0; i < entries.length; i++) {
        cumulative += weights[i]!;
        if (point < cumulative) {
          return entries[i]!;
        }
      }
      // Floating-point edge case (point lands exactly on totalWeight, e.g.
      // random() === 1): fall back to the last entry rather than returning
      // null for what is otherwise a fully eligible slot.
      return entries[entries.length - 1]!;
    },
  };
}
