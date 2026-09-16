import type { Pool } from "pg";
import type { RecommendationRepository, RecommendationRule } from "@mercatus-liber/recommendations";

/**
 * Self-contained DDL for this file only -- deliberately NOT merged into this
 * package's shared schema.ts (see this file's story: 12 other agents are
 * concurrently adding their own self-contained adapter files to this same
 * package; a later, sequential story wires every repository's DDL/exports
 * into schema.ts/index.ts together, once).
 *
 * `targetProductIds` (string[]) is stored as a single JSONB column, matching
 * this package's own established convention (see e.g. bundles.ts's `tiers`
 * column).
 */
const RECOMMENDATION_RULES_DDL = `
  CREATE TABLE IF NOT EXISTS recommendation_rules (
    id TEXT PRIMARY KEY,
    source_product_id TEXT NOT NULL,
    label TEXT NOT NULL,
    placement TEXT NOT NULL,
    target_product_ids JSONB NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_recommendation_rules_source_product_id ON recommendation_rules(source_product_id);
`;

interface RecommendationRuleRow {
  id: string;
  source_product_id: string;
  label: string;
  placement: string;
  target_product_ids: string[];
  status: string;
}

function rowToRecommendationRule(row: RecommendationRuleRow): RecommendationRule {
  return {
    id: row.id,
    sourceProductId: row.source_product_id,
    label: row.label,
    placement: row.placement as RecommendationRule["placement"],
    targetProductIds: row.target_product_ids,
    status: row.status as RecommendationRule["status"],
  };
}

/**
 * Real Postgres-backed RecommendationRepository --
 * @mercatus-liber/recommendations' RecommendationRepository was
 * in-memory-only across every adapter, including Postgres, until now (see
 * createInMemoryRecommendationRepository in
 * @mercatus-liber/recommendations' in-memory-repository.ts for the
 * reference behavior this mirrors: save()/get()/list() over a
 * RecommendationRule keyed by id).
 *
 * Runs its own DDL on construction and awaits it before every method below
 * (matching promotions.ts's own `ready` convention in this package) --
 * pool.query() may hand out any free pooled connection, so a fire-and-forget
 * DDL call here could otherwise race a get/list/save issued immediately
 * after construction onto a different connection and hit "relation
 * recommendation_rules does not exist".
 */
export function createPostgresRecommendationRepository(pool: Pool): RecommendationRepository {
  const ready = pool.query(RECOMMENDATION_RULES_DDL);

  return {
    async get(id: string): Promise<RecommendationRule | null> {
      await ready;
      const result = await pool.query<RecommendationRuleRow>(
        "SELECT * FROM recommendation_rules WHERE id = $1",
        [id],
      );
      return result.rows[0] ? rowToRecommendationRule(result.rows[0]) : null;
    },
    async list(): Promise<RecommendationRule[]> {
      await ready;
      const result = await pool.query<RecommendationRuleRow>("SELECT * FROM recommendation_rules");
      return result.rows.map(rowToRecommendationRule);
    },
    async save(rule: RecommendationRule): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO recommendation_rules (id, source_product_id, label, placement, target_product_ids, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           source_product_id = EXCLUDED.source_product_id,
           label = EXCLUDED.label,
           placement = EXCLUDED.placement,
           target_product_ids = EXCLUDED.target_product_ids,
           status = EXCLUDED.status`,
        [
          rule.id,
          rule.sourceProductId,
          rule.label,
          rule.placement,
          JSON.stringify(rule.targetProductIds),
          rule.status,
        ],
      );
    },
  };
}
