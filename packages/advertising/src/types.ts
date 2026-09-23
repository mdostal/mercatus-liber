export type CampaignStatus = "active" | "inactive";

/**
 * Both fields are bare strings, never validated against the service-areas
 * or cms subsystems here -- this package is deliberately as thin as
 * recommendations (see design-discussion.md §3 and
 * docs/subsystems/19-advertising.md's open question 1). `null` on a field
 * means untargeted on that dimension (matches every request); a campaign
 * with both fields `null` is eligible for every ad-slot render.
 */
export interface CampaignTargeting {
  serviceAreaId: string | null;
  pageSlug: string | null;
}

/** One piece of creative content within a Campaign. `weight` is the relative selection weight used by AdvertisingService.getActiveCreativeForSlot's weighted-random rotation -- default 1 when not specified at creation. */
export interface Creative {
  id: string;
  headline: string;
  body: string;
  imageUrl: string | null;
  linkHref: string;
  weight: number;
}

/**
 * An admin-curated advertising campaign: one or more Creatives, an
 * optional active date range (`startsAt`/`endsAt`, both nullable ISO 8601),
 * and optional service-area/page-slug targeting. See
 * docs/subsystems/19-advertising.md and design-discussion.md §3 for the
 * full eligibility/rotation model implemented by AdvertisingService.
 */
export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  /** ISO 8601; null = eligible immediately (no start-date gate). */
  startsAt: string | null;
  /** ISO 8601; null = no expiry. */
  endsAt: string | null;
  targeting: CampaignTargeting;
  /** Must contain at least one creative (see createCampaign/updateCampaign validation). */
  creatives: Creative[];
  /**
   * Which demo store this campaign belongs to. Optional/additive, same
   * shape and reason as `Page.demoSlug` (epic 60, `packages/cms`) and
   * `Category.demoSlug` (epic 61, `packages/marketing-catalog`) -- a real
   * gap found by `commerce-gap-audit-3`: `CampaignRepository.list()`/
   * `AdvertisingService.getActiveCreativeForSlot()` had no demo-scoping
   * concept at all, so under the shared Postgres backend print-shop and
   * Northline Home Tech both resolve to, an untargeted campaign seeded for
   * one demo (`targeting: { serviceAreaId: null, pageSlug: null }`, which
   * is eligible on every render) rendered live on the OTHER demo's ad
   * slots too -- confirmed live against commerce.mdostal.com before this
   * fix (Northline's "Whole-Home WiFi Mesh Installs" creative, linking to
   * `/demo/northline/...`, rendering on print-shop's own home page).
   * Optional, not required, for the same backward-compatibility reason as
   * the two precedents above: `list()`/`getActiveCreativeForSlot()` called
   * with no `demoSlug` filter still return/consider every campaign
   * (including ones with no `demoSlug` set), so existing unscoped callers
   * are unaffected; a `demoSlug`-scoped call only matches campaigns whose
   * own `demoSlug` equals it.
   */
  demoSlug?: string;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface CampaignRepository {
  get(id: string): Promise<Campaign | null>;
  list(filter?: { demoSlug?: string }): Promise<Campaign[]>;
  save(campaign: Campaign): Promise<void>;
}

/**
 * Input to AdvertisingService.createCampaign -- id is always
 * service-assigned; status defaults to "active". Creative ids are
 * caller-supplied (mirrors bundles' BundleTier.id convention); a
 * creative's `weight` is optional here and defaults to 1 when not
 * specified (see Creative's doc comment).
 */
export type CreateCampaignInput = Omit<Campaign, "id" | "status" | "creatives"> & {
  status?: CampaignStatus;
  creatives: Array<Omit<Creative, "weight"> & { weight?: number }>;
};
