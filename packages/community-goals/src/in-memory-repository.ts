import type { Goal, GoalRepository, GoalVoteRepository } from "./types.js";

/**
 * Default in-memory GoalRepository -- Map-backed, structuredClone in/out,
 * same shape as bundles'/cart's/promotions' own in-memory repositories (see
 * createInMemoryBundleRepository's doc comment for the shared precedent). A
 * durable adapter (sqlite/postgres) is a later, separate concern, same
 * "reference default ships without one" posture bundles took at v1.
 */
export function createInMemoryGoalRepository(): GoalRepository {
  const goals = new Map<string, Goal>();
  return {
    async get(id: string): Promise<Goal | null> {
      const goal = goals.get(id);
      return goal ? structuredClone(goal) : null;
    },
    async getBySlug(slug: string): Promise<Goal | null> {
      const goal = Array.from(goals.values()).find((g) => g.slug === slug);
      return goal ? structuredClone(goal) : null;
    },
    async list(filter?: { demoSlug?: string }): Promise<Goal[]> {
      const all = Array.from(goals.values());
      const filtered = filter?.demoSlug ? all.filter((g) => g.demoSlug === filter.demoSlug) : all;
      return filtered.map((g) => structuredClone(g));
    },
    async save(goal: Goal): Promise<void> {
      goals.set(goal.id, structuredClone(goal));
    },
    async incrementVoteCount(id: string): Promise<Goal> {
      const existing = goals.get(id);
      if (!existing) throw new Error(`Goal not found: ${id}`);
      // Atomic by construction: a synchronous Map read-modify-write, no
      // `await` anywhere in this body for another call to interleave on
      // (see GoalRepository.incrementVoteCount's own doc comment -- this is
      // the in-memory equivalent of Postgres's single atomic UPDATE).
      const updated: Goal = { ...existing, voteCount: existing.voteCount + 1 };
      goals.set(id, structuredClone(updated));
      return structuredClone(updated);
    },
  };
}

/**
 * Default in-memory GoalVoteRepository. `recordIfNew` is atomic here simply
 * because JS is single-threaded and this does no `await` between the
 * Set.has check and the Set.add -- a durable adapter (sqlite/postgres) MUST
 * instead rely on a real unique constraint on (goalId, voterKey) and treat
 * the resulting constraint-violation as "already voted" (see this package's
 * own test suite for the exact contract a conforming adapter must satisfy).
 */
export function createInMemoryGoalVoteRepository(): GoalVoteRepository {
  const voted = new Set<string>();
  const key = (goalId: string, voterKey: string) => `${goalId}\u0000${voterKey}`;

  return {
    async recordIfNew(goalId: string, voterKey: string): Promise<boolean> {
      const k = key(goalId, voterKey);
      if (voted.has(k)) return false;
      voted.add(k);
      return true;
    },
    async hasVoted(goalId: string, voterKey: string): Promise<boolean> {
      return voted.has(key(goalId, voterKey));
    },
    async countForGoal(goalId: string): Promise<number> {
      let count = 0;
      for (const k of voted) {
        if (k.startsWith(`${goalId}\u0000`)) count++;
      }
      return count;
    },
  };
}
