import type { Pool } from "pg";
import type { Goal, GoalRepository, GoalVoteRepository } from "@mercatus-liber/community-goals";

/**
 * Self-contained schema for the community-goals persistence surface, run at
 * repository-creation time -- same "own schema-init, no shared-file edits"
 * pattern this package's bundles.ts/orders.ts already established (see
 * bundles.ts's own header comment for the precedent). community-goals is
 * not part of schema.ts's SCHEMA_SQL.
 *
 * goal_votes' PRIMARY KEY (goal_id, voter_key) is the real, durable
 * uniqueness guarantee GoalVoteRepository.recordIfNew's own doc comment
 * demands -- not application-level dedup. recordIfNew below relies on this
 * constraint via INSERT ... ON CONFLICT DO NOTHING.
 */
const COMMUNITY_GOALS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  bonus_count INTEGER,
  vote_count INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  demo_slug TEXT,
  created_at TEXT NOT NULL
);
-- enabled was added after this table's first release (PR #5) -- ADD COLUMN
-- IF NOT EXISTS is safe against any already-created table missing it,
-- same ALTER-after-CREATE discipline bundles.ts's own demo_slug addition
-- and the product-media-attribution migration-safety work both established.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_goals_demo_slug ON goals(demo_slug);

CREATE TABLE IF NOT EXISTS goal_votes (
  goal_id TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (goal_id, voter_key)
);
`;

interface GoalRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  target_count: number;
  bonus_count: number | null;
  vote_count: number;
  enabled: boolean;
  demo_slug: string | null;
  created_at: string;
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    targetCount: row.target_count,
    ...(row.bonus_count !== null ? { bonusCount: row.bonus_count } : {}),
    voteCount: row.vote_count,
    enabled: row.enabled,
    ...(row.demo_slug ? { demoSlug: row.demo_slug } : {}),
    createdAt: row.created_at,
  };
}

/** Real Postgres-backed GoalRepository -- see this file's own header for the shared schema-init/table precedent. */
export function createPostgresGoalRepository(pool: Pool): GoalRepository {
  const schemaReady = pool.query(COMMUNITY_GOALS_SCHEMA_SQL).then(() => undefined);

  return {
    async get(id: string): Promise<Goal | null> {
      await schemaReady;
      const result = await pool.query<GoalRow>("SELECT * FROM goals WHERE id = $1", [id]);
      return result.rows[0] ? rowToGoal(result.rows[0]) : null;
    },

    async getBySlug(slug: string): Promise<Goal | null> {
      await schemaReady;
      const result = await pool.query<GoalRow>("SELECT * FROM goals WHERE slug = $1", [slug]);
      return result.rows[0] ? rowToGoal(result.rows[0]) : null;
    },

    async list(filter?: { demoSlug?: string }): Promise<Goal[]> {
      await schemaReady;
      const result = filter?.demoSlug
        ? await pool.query<GoalRow>("SELECT * FROM goals WHERE demo_slug = $1", [filter.demoSlug])
        : await pool.query<GoalRow>("SELECT * FROM goals");
      return result.rows.map(rowToGoal);
    },

    async save(goal: Goal): Promise<void> {
      await schemaReady;
      await pool.query(
        `INSERT INTO goals (id, slug, title, description, target_count, bonus_count, vote_count, enabled, demo_slug, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           target_count = EXCLUDED.target_count,
           bonus_count = EXCLUDED.bonus_count,
           vote_count = EXCLUDED.vote_count,
           enabled = EXCLUDED.enabled,
           demo_slug = EXCLUDED.demo_slug,
           created_at = EXCLUDED.created_at`,
        [goal.id, goal.slug, goal.title, goal.description, goal.targetCount, goal.bonusCount ?? null, goal.voteCount, goal.enabled, goal.demoSlug ?? null, goal.createdAt],
      );
    },

    async incrementVoteCount(id: string): Promise<Goal> {
      await schemaReady;
      // Genuinely atomic -- Postgres serializes concurrent UPDATEs against
      // the same row, so two concurrent votes can never both read the same
      // pre-increment value the way the old service-layer get-then-save
      // bug allowed. See GoalRepository.incrementVoteCount's own doc
      // comment for the full bug report this fixes.
      const result = await pool.query<GoalRow>("UPDATE goals SET vote_count = vote_count + 1 WHERE id = $1 RETURNING *", [id]);
      if (!result.rows[0]) throw new Error(`Goal not found: ${id}`);
      return rowToGoal(result.rows[0]);
    },
  };
}

/**
 * Real Postgres-backed GoalVoteRepository. recordIfNew is genuinely atomic
 * here -- `ON CONFLICT (goal_id, voter_key) DO NOTHING RETURNING goal_id`
 * either inserts and returns one row (this call newly recorded the vote) or
 * conflicts and returns zero rows (another call already had), decided
 * entirely by Postgres's own unique-constraint enforcement under
 * concurrency, never a separate has-then-set from this process.
 */
export function createPostgresGoalVoteRepository(pool: Pool): GoalVoteRepository {
  const schemaReady = pool.query(COMMUNITY_GOALS_SCHEMA_SQL).then(() => undefined);

  return {
    async recordIfNew(goalId: string, voterKey: string, createdAt: string): Promise<boolean> {
      await schemaReady;
      const result = await pool.query<{ goal_id: string }>(
        `INSERT INTO goal_votes (goal_id, voter_key, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (goal_id, voter_key) DO NOTHING
         RETURNING goal_id`,
        [goalId, voterKey, createdAt],
      );
      return result.rows.length === 1;
    },

    async hasVoted(goalId: string, voterKey: string): Promise<boolean> {
      await schemaReady;
      const result = await pool.query("SELECT 1 FROM goal_votes WHERE goal_id = $1 AND voter_key = $2", [goalId, voterKey]);
      return result.rows.length > 0;
    },

    async countForGoal(goalId: string): Promise<number> {
      await schemaReady;
      const result = await pool.query<{ count: string }>("SELECT COUNT(*) as count FROM goal_votes WHERE goal_id = $1", [goalId]);
      return parseInt(result.rows[0]?.count ?? "0", 10);
    },
  };
}
