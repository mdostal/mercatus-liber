/**
 * Real, table-backed GoalRepository/GoalVoteRepository coverage (see this
 * package's src/community-goals.ts). Defines its OWN local fake `pg` Pool
 * double, scoped to exactly the `goals`/`goal_votes` tables and the fixed
 * set of SQL statements src/community-goals.ts issues -- same isolation
 * precedent as bundles.test.ts's own header comment describes, avoiding
 * concurrent-edit collisions with other agents extending the shared
 * test/fake-pool.ts for their own tables in parallel.
 */
import type { Goal } from "@mercatus-liber/community-goals";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresGoalRepository, createPostgresGoalVoteRepository } from "../src/community-goals.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeCommunityGoalsPool(): FakePool {
  const goals = new Map<string, FakeRow>();
  const votes = new Map<string, FakeRow>(); // keyed by `${goal_id}::${voter_key}`

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      // --- goals ---
      if (sql === "SELECT * FROM goals WHERE id = $1") {
        const row = goals.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM goals WHERE slug = $1") {
        const row = [...goals.values()].find((g) => g.slug === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM goals WHERE demo_slug = $1") {
        return { rows: [...goals.values()].filter((g) => g.demo_slug === values[0]) as T[] };
      }
      if (sql === "SELECT * FROM goals") {
        return { rows: [...goals.values()] as T[] };
      }
      if (sql.startsWith("INSERT INTO goals")) {
        const [id, slug, title, description, targetCount, bonusCount, voteCount, enabled, demoSlug, createdAt] = values as [
          string,
          string,
          string,
          string,
          number,
          number | null,
          number,
          boolean,
          string | null,
          string,
        ];
        goals.set(id, {
          id,
          slug,
          title,
          description,
          target_count: targetCount,
          bonus_count: bonusCount,
          vote_count: voteCount,
          enabled,
          demo_slug: demoSlug,
          created_at: createdAt,
        });
        return { rows: [] };
      }

      // --- goal_votes ---
      if (sql.startsWith("INSERT INTO goal_votes")) {
        const [goalId, voterKey, createdAt] = values as [string, string, string];
        const key = `${goalId}::${voterKey}`;
        if (votes.has(key)) {
          return { rows: [] }; // ON CONFLICT DO NOTHING -- no row returned
        }
        votes.set(key, { goal_id: goalId, voter_key: voterKey, created_at: createdAt });
        return { rows: [{ goal_id: goalId }] as T[] }; // RETURNING goal_id
      }
      if (sql === "SELECT 1 FROM goal_votes WHERE goal_id = $1 AND voter_key = $2") {
        const key = `${values[0]}::${values[1]}`;
        return { rows: (votes.has(key) ? [{}] : []) as T[] };
      }
      if (sql === "SELECT COUNT(*) as count FROM goal_votes WHERE goal_id = $1") {
        const count = [...votes.values()].filter((v) => v.goal_id === values[0]).length;
        return { rows: [{ count: String(count) }] as T[] };
      }

      // castvote-race-condition fix: the real Postgres UPDATE is atomic at
      // the database level (single statement, row-locked); this fake pool
      // mirrors that by never yielding between the read and the write --
      // same no-await-in-between argument as the in-memory repository's
      // own incrementVoteCount.
      if (sql === "UPDATE goals SET vote_count = vote_count + 1 WHERE id = $1 RETURNING *") {
        const goal = goals.get(values[0] as string);
        if (!goal) return { rows: [] };
        const updated = { ...goal, vote_count: (goal.vote_count as number) + 1 };
        goals.set(values[0] as string, updated);
        return { rows: [updated] as T[] };
      }

      throw new Error(`FakeCommunityGoalsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresGoalRepository", () => {
  let pool: FakePool;
  let repo: ReturnType<typeof createPostgresGoalRepository>;

  beforeEach(() => {
    pool = createFakeCommunityGoalsPool();
    repo = createPostgresGoalRepository(pool as never);
  });

  const goal: Goal = {
    id: "g1",
    slug: "watch-it-build",
    title: "Watch it build",
    description: "Live print stream",
    targetCount: 1000,
    bonusCount: 2000,
    voteCount: 0,
    enabled: true,
    createdAt: "2026-11-04T00:00:00.000Z",
  };

  it("saves and retrieves a goal by id", async () => {
    await repo.save(goal);
    expect(await repo.get("g1")).toEqual(goal);
  });

  it("retrieves a goal by slug", async () => {
    await repo.save(goal);
    expect(await repo.getBySlug("watch-it-build")).toEqual(goal);
  });

  it("round-trips a goal with no bonusCount/demoSlug -- omitted, not stored as null-ish values on the typed object", async () => {
    const plain: Goal = { id: "g2", slug: "plain", title: "Plain", description: "", targetCount: 10, voteCount: 0, enabled: true, createdAt: "now" };
    await repo.save(plain);
    const found = await repo.get("g2");
    expect(found?.bonusCount).toBeUndefined();
    expect(found?.demoSlug).toBeUndefined();
  });

  it("round-trips enabled: false (not just the true default)", async () => {
    await repo.save({ ...goal, id: "g3", slug: "disabled-goal", enabled: false });
    expect((await repo.get("g3"))?.enabled).toBe(false);
  });

  it("list filters by demoSlug the same way bundles/categories/pages do", async () => {
    await repo.save({ ...goal, id: "g1", slug: "a", demoSlug: "print-shop" });
    await repo.save({ ...goal, id: "g2", slug: "b", demoSlug: "northline" });
    const scoped = await repo.list({ demoSlug: "northline" });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.slug).toBe("b");
    expect(await repo.list()).toHaveLength(2);
  });

  it("save upserts on conflict -- a vote-count update survives a second save with the same id", async () => {
    await repo.save(goal);
    await repo.save({ ...goal, voteCount: 500 });
    expect((await repo.get("g1"))?.voteCount).toBe(500);
  });

  describe("incrementVoteCount", () => {
    it("increments voteCount by exactly 1 and returns the full updated goal", async () => {
      await repo.save(goal);
      const updated = await repo.incrementVoteCount("g1");
      expect(updated.voteCount).toBe(goal.voteCount + 1);
      expect(updated.slug).toBe(goal.slug);
      expect((await repo.get("g1"))?.voteCount).toBe(goal.voteCount + 1);
    });

    it("throws for an unknown id, rather than silently returning something wrong", async () => {
      await expect(repo.incrementVoteCount("missing")).rejects.toThrow(/not found/i);
    });

    it("🔍 N concurrent increments (fired via Promise.all, no await between them) land exactly N higher -- the real castvote-race-condition regression", async () => {
      await repo.save({ ...goal, voteCount: 0 });
      await Promise.all(Array.from({ length: 10 }, () => repo.incrementVoteCount("g1")));
      expect((await repo.get("g1"))?.voteCount).toBe(10);
    });
  });
});

describe("createPostgresGoalVoteRepository", () => {
  let pool: FakePool;
  let votes: ReturnType<typeof createPostgresGoalVoteRepository>;

  beforeEach(() => {
    pool = createFakeCommunityGoalsPool();
    votes = createPostgresGoalVoteRepository(pool as never);
  });

  it("recordIfNew returns true for a genuinely new (goalId, voterKey) pair", async () => {
    expect(await votes.recordIfNew("g1", "voter-1", "now")).toBe(true);
  });

  it("recordIfNew returns false for a pair that already voted -- real unique-constraint dedup, not app-level", async () => {
    await votes.recordIfNew("g1", "voter-1", "now");
    expect(await votes.recordIfNew("g1", "voter-1", "later")).toBe(false);
  });

  it("the same voterKey can vote on two DIFFERENT goals independently", async () => {
    expect(await votes.recordIfNew("g1", "voter-1", "now")).toBe(true);
    expect(await votes.recordIfNew("g2", "voter-1", "now")).toBe(true);
  });

  it("hasVoted reflects recordIfNew's own ledger", async () => {
    expect(await votes.hasVoted("g1", "voter-1")).toBe(false);
    await votes.recordIfNew("g1", "voter-1", "now");
    expect(await votes.hasVoted("g1", "voter-1")).toBe(true);
  });

  it("countForGoal counts only votes for that goal, as a real integer (not the string COUNT(*) returns over the wire)", async () => {
    await votes.recordIfNew("g1", "voter-1", "now");
    await votes.recordIfNew("g1", "voter-2", "now");
    await votes.recordIfNew("g2", "voter-1", "now");
    const count = await votes.countForGoal("g1");
    expect(count).toBe(2);
    expect(typeof count).toBe("number");
  });
});
