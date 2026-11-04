import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import type { CreateGoalInput, Goal, GoalRepository, GoalThreshold, GoalVoteRepository } from "./types.js";
import { DuplicateGoalSlugError, GoalDisabledError, InvalidGoalThresholdsError } from "./types.js";

export interface CastVoteResult {
  goal: Goal;
  /** True when (goalId, voterKey) had already voted -- the vote was not double-counted; voteCount is unchanged. */
  alreadyVoted: boolean;
  /**
   * Set to "target"/"bonus" exactly on the single vote that pushed
   * voteCount from below that threshold to at-or-above it -- null on every
   * other vote (including votes made after a threshold was already
   * crossed). A caller (e.g. a notification subsystem) uses this to react
   * exactly once per threshold rather than re-triggering on every
   * subsequent vote.
   */
  crossedThreshold: GoalThreshold | null;
}

export interface GoalsService {
  createGoal(input: CreateGoalInput): Promise<Goal>;
  getGoal(id: string): Promise<Goal | null>;
  getGoalBySlug(slug: string): Promise<Goal | null>;
  listGoals(filter?: { demoSlug?: string }): Promise<Goal[]>;
  /** Merges fields into an existing goal; null if no goal has this id. Id/voteCount/createdAt are never overwritten by input. Re-validates thresholds exactly as createGoal does. */
  updateGoal(id: string, input: Partial<Omit<CreateGoalInput, "slug">>): Promise<Goal | null>;
  /** Convenience one-liners over updateGoal's `enabled` field, same shape as Bundle's deactivateBundle. Null if no goal has this id. */
  enableGoal(id: string): Promise<Goal | null>;
  disableGoal(id: string): Promise<Goal | null>;
  /**
   * Records one vote from `voterKey` toward `goalId`, deduped via
   * GoalVoteRepository.recordIfNew. Idempotent: voting again with the same
   * voterKey returns `alreadyVoted: true` and never increments voteCount
   * twice. Returns null only when goalId doesn't resolve to a Goal. Throws
   * GoalDisabledError (does not return a result) when the goal's `enabled`
   * is false -- a disabled goal never accepts a vote, counted or not.
   */
  castVote(goalId: string, voterKey: string): Promise<CastVoteResult | null>;
}

function validateThresholds(targetCount: number, bonusCount?: number): void {
  if (bonusCount !== undefined && bonusCount <= targetCount) {
    throw new InvalidGoalThresholdsError(targetCount, bonusCount);
  }
}

/** Which threshold, if any, the voteCount transition from `before` to `after` just crossed -- at most one per call, target checked first since it's always <= bonusCount. */
function crossedThresholdBetween(goal: Goal, before: number, after: number): GoalThreshold | null {
  if (before < goal.targetCount && after >= goal.targetCount) return "target";
  if (goal.bonusCount !== undefined && before < goal.bonusCount && after >= goal.bonusCount) return "bonus";
  return null;
}

export function createGoalsService(deps: { repository: GoalRepository; votes: GoalVoteRepository; events?: EventBus }): GoalsService {
  const { repository, votes, events } = deps;

  return {
    async createGoal(input: CreateGoalInput): Promise<Goal> {
      validateThresholds(input.targetCount, input.bonusCount);
      if (await repository.getBySlug(input.slug)) {
        throw new DuplicateGoalSlugError(input.slug);
      }
      const goal: Goal = {
        ...input,
        id: randomUUID(),
        voteCount: 0,
        enabled: input.enabled ?? true,
        createdAt: new Date().toISOString(),
      };
      await repository.save(goal);
      return goal;
    },

    async getGoal(id: string): Promise<Goal | null> {
      return repository.get(id);
    },

    async getGoalBySlug(slug: string): Promise<Goal | null> {
      return repository.getBySlug(slug);
    },

    async listGoals(filter?: { demoSlug?: string }): Promise<Goal[]> {
      return repository.list(filter);
    },

    async updateGoal(id: string, input: Partial<Omit<CreateGoalInput, "slug">>): Promise<Goal | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Goal = { ...existing, ...input, id: existing.id, slug: existing.slug, voteCount: existing.voteCount, createdAt: existing.createdAt };
      validateThresholds(updated.targetCount, updated.bonusCount);
      await repository.save(updated);
      return updated;
    },

    async enableGoal(id: string): Promise<Goal | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Goal = { ...existing, enabled: true };
      await repository.save(updated);
      return updated;
    },

    async disableGoal(id: string): Promise<Goal | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Goal = { ...existing, enabled: false };
      await repository.save(updated);
      return updated;
    },

    async castVote(goalId: string, voterKey: string): Promise<CastVoteResult | null> {
      const goal = await repository.get(goalId);
      if (!goal) return null;
      if (!goal.enabled) {
        throw new GoalDisabledError(goal.slug);
      }

      const newlyRecorded = await votes.recordIfNew(goalId, voterKey, new Date().toISOString());
      await events?.publish("community-goals.vote.cast", { goalId, slug: goal.slug, voterKey, alreadyVoted: !newlyRecorded });

      if (!newlyRecorded) {
        return { goal, alreadyVoted: true, crossedThreshold: null };
      }

      // castvote-race-condition fix: derive before/after from THIS call's
      // own atomic increment result, never from the stale `goal` read
      // above. Under concurrent votes, repository.incrementVoteCount
      // serializes each call to a unique, correct `after` (no two
      // concurrent increments can return the same value), and `after - 1`
      // is guaranteed to be exactly the count immediately before THIS
      // vote's own contribution -- regardless of how many other votes are
      // racing alongside it. The old code read `goal.voteCount` once at
      // the top of castVote and computed before/after from that single
      // stale snapshot, so two concurrent calls could silently overwrite
      // each other's increment (a real vote lost) and both independently
      // believe they crossed the same threshold. See GoalRepository.
      // incrementVoteCount's own doc comment for the full bug report.
      const updated = await repository.incrementVoteCount(goalId);
      const after = updated.voteCount;
      const before = after - 1;

      const crossedThreshold = crossedThresholdBetween(updated, before, after);
      if (crossedThreshold) {
        await events?.publish("community-goals.goal.threshold_crossed", { goalId, slug: updated.slug, threshold: crossedThreshold, voteCountAtCrossing: after });
      }

      return { goal: updated, alreadyVoted: false, crossedThreshold };
    },
  };
}
