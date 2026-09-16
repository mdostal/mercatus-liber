import type { Pool } from "pg";
import type { Campaign, CampaignRepository, CampaignStatus } from "@mercatus-liber/advertising";

/**
 * Table DDL for the advertising subsystem's CampaignRepository -- kept local
 * to this file (not added to schema.ts) per the file-isolation rule for
 * concurrently-developed adapter-postgres subsystems: each subsystem owns
 * its own self-contained DDL and runs it itself, rather than editing a
 * shared schema constant. `targeting` (CampaignTargeting) and `creatives`
 * (Creative[]) map to JSONB, matching this package's existing JSONB-for-
 * structured-fields convention (see categories.ts / schema.ts).
 */
const CAMPAIGNS_DDL = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  targeting JSONB NOT NULL,
  creatives JSONB NOT NULL
);
`;

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  targeting: Campaign["targeting"]; // JSONB -- already parsed by the pg driver
  creatives: Campaign["creatives"]; // JSONB
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    status: row.status as CampaignStatus,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    targeting: row.targeting,
    creatives: row.creatives,
  };
}

/**
 * Real Postgres-backed CampaignRepository -- @mercatus-liber/advertising's
 * CampaignRepository was in-memory-only across every adapter, including
 * Postgres, until now (see in-memory-repository.ts for the exact reference
 * behavior this mirrors: get/list return structuredClone-equivalent copies,
 * save is a full upsert keyed by id). Unlike createPostgresAdapter (this
 * package's src/index.ts), this factory is synchronous and self-contained:
 * it runs its own DDL on construction, tracked in a local `ready` promise
 * that every method awaits first, so callers don't need to await
 * construction or coordinate with any other subsystem's schema setup.
 */
export function createPostgresCampaignRepository(pool: Pool): CampaignRepository {
  const ready = pool.query(CAMPAIGNS_DDL).then(() => undefined);

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
        `INSERT INTO campaigns (id, name, status, starts_at, ends_at, targeting, creatives)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           targeting = EXCLUDED.targeting,
           creatives = EXCLUDED.creatives`,
        [
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.startsAt,
          campaign.endsAt,
          JSON.stringify(campaign.targeting),
          JSON.stringify(campaign.creatives),
        ],
      );
    },
  };
}
