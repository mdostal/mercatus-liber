import type { Pool } from "pg";
import type { Campaign, CampaignRepository, CampaignStatus, Creative } from "@mercatus-liber/advertising";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see this file's header context: several other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once). `creatives` (Creative[])
 * has no natural flat-column mapping and, per this task's own reasoning, is
 * always read/written as a whole -- never queried by individual creative id
 * independently of its parent campaign -- so it's stored as one JSONB
 * column (mirroring bundles.ts's `tiers` column and promotions.ts's
 * `target_sku_ids` column), serialized with JSON.stringify on the way in
 * and auto-parsed back into a JS value by the driver on the way out.
 * `targeting` is flattened into two nullable columns (both null = untargeted
 * on both dimensions, matching CampaignTargeting's doc comment) rather than
 * its own JSONB column, since it's always exactly those two fields.
 * `starts_at`/`ends_at` are real TIMESTAMPTZ columns -- the pg driver parses
 * those back into JS Date objects, so rowToCampaign below normalizes them
 * back to the ISO 8601 strings Campaign's type expects.
 */
const CAMPAIGNS_DDL = `
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    targeting_service_area_id TEXT,
    targeting_page_slug TEXT,
    creatives JSONB NOT NULL
  );
`;

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  starts_at: Date | string | null; // TIMESTAMPTZ -- Date from a real pg driver, string from the test fake-pool double
  ends_at: Date | string | null;
  targeting_service_area_id: string | null;
  targeting_page_slug: string | null;
  creatives: Creative[]; // JSONB -- already parsed by the pg driver
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    status: row.status as CampaignStatus,
    startsAt: toIsoOrNull(row.starts_at),
    endsAt: toIsoOrNull(row.ends_at),
    targeting: {
      serviceAreaId: row.targeting_service_area_id,
      pageSlug: row.targeting_page_slug,
    },
    creatives: row.creatives,
  };
}

/**
 * Real Postgres-backed CampaignRepository -- until now
 * @mercatus-liber/advertising' CampaignRepository (admin-curated campaigns,
 * each with one or more Creatives and optional date-range/service-area/
 * page-slug targeting) was in-memory-only regardless of backend, so a
 * campaign never survived a server restart. `save` is a full upsert
 * (matching the in-memory reference implementation exactly): re-saving an
 * existing id overwrites every field, including the entire `creatives`
 * array.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. `get`/`list`/`save` each await that DDL's
 * completion first, so a repository is safe to use immediately after
 * construction.
 */
export function createPostgresCampaignRepository(pool: Pool): CampaignRepository {
  const ready = pool.query(CAMPAIGNS_DDL);

  return {
    async get(id: string): Promise<Campaign | null> {
      await ready;
      const result = await pool.query<CampaignRow>("SELECT * FROM campaigns WHERE id = $1", [id]);
      return result.rows[0] ? rowToCampaign(result.rows[0]) : null;
    },
    async list(): Promise<Campaign[]> {
      await ready;
      const result = await pool.query<CampaignRow>("SELECT * FROM campaigns");
      return result.rows.map(rowToCampaign);
    },
    async save(campaign: Campaign): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO campaigns (
           id, name, status, starts_at, ends_at,
           targeting_service_area_id, targeting_page_slug, creatives
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           targeting_service_area_id = EXCLUDED.targeting_service_area_id,
           targeting_page_slug = EXCLUDED.targeting_page_slug,
           creatives = EXCLUDED.creatives`,
        [
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.startsAt,
          campaign.endsAt,
          campaign.targeting.serviceAreaId,
          campaign.targeting.pageSlug,
          JSON.stringify(campaign.creatives),
        ],
      );
    },
  };
}
