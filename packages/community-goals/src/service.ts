import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import type { CreateGoalInput, Goal, GoalRepository, GoalThreshold, GoalVoteRepository } from "./types.js";
import { DuplicateGoalSlugError, InvalidGoalThresholdsError } from "./types.js";

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
  /**
   * Records one vote from `voterKey` toward `goalId`, deduped via
   * GoalVoteRepository.recordIfNew. Idempotent: voting again with the same
   * voterKey returns `alreadyVoted: true` and never increments voteCount
   * twice. Returns null only when goalId doesn't resolve to a Goal.
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

    async castVote(goalId: string, voterKey: string): Promise<CastVoteResult | null> {
      const goal = await repository.get(goalId);
      if (!goal) return null;

      const newlyRecorded = await votes.recordIfNew(goalId, voterKey, new Date().toISOString());
      await events?.publish("community-goals.vote.cast", { goalId, slug: goal.slug, voterKey, alreadyVoted: !newlyRecorded });

      if (!newlyRecorded) {
        return { goal, alreadyVoted: true, crossedThreshold: null };
      }

      const before = goal.voteCount;
      const after = before + 1;
      const updated: Goal = { ...goal, voteCount: after };
      await repository.save(updated);

      const crossedThreshold = crossedThresholdBetween(updated, before, after);
      if (crossedThreshold) {
        await events?.publish("community-goals.goal.threshold_crossed", { goalId, slug: updated.slug, threshold: crossedThreshold, voteCountAtCrossing: after });
      }

      return { goal: updated, alreadyVoted: false, crossedThreshold };
    },
  };
}
