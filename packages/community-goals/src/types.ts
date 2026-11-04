/**
 * A vote-threshold-gated feature unlock -- e.g. "1000 votes unlocks the live
 * print stream; 2000 unlocks a bonus second printer." `voteCount` is a
 * denormalized counter (not derived by counting GoalVote rows on every
 * read): the service increments it exactly once per newly-recorded vote, so
 * reads stay O(1) regardless of vote volume. `status` is deliberately NOT
 * stored here -- it's always derived from voteCount vs the thresholds (see
 * computeGoalStatus) so it can never drift out of sync with the count that
 * produced it, the same "never cache a derived value into the record"
 * discipline bundles' TierPricing doc comment documents for sibling reasons.
 */
export interface Goal {
  id: string;
  /** Stable, storefront-facing identifier (e.g. "watch-it-build-livestream") -- unique, used by getGoalBySlug. */
  slug: string;
  title: string;
  description: string;
  /** Vote count that flips status from "locked" to "unlocked". */
  targetCount: number;
  /**
   * Optional second, higher threshold that flips status to "bonus-unlocked"
   * (e.g. a stretch reward like a second printer). Must be greater than
   * targetCount when present -- enforced at createGoal/updateGoal time.
   */
  bonusCount?: number;
  voteCount: number;
  /**
   * Which demo store this goal belongs to -- same optional/additive
   * shape as Bundle.demoSlug, Page.demoSlug, Category.demoSlug,
   * ServiceArea.demoSlug (see bundles/src/types.ts's Bundle.demoSlug doc
   * comment for the shared precedent/rationale). Unscoped (undefined) sees
   * every goal, same as those siblings.
   */
  demoSlug?: string;
  createdAt: string;
}

export type GoalThreshold = "target" | "bonus";

/**
 * Pure, derived view of a Goal's progress -- the ONLY shape a storefront's
 * progress-bar/liquid-fill/gradient UI needs to render itself; this package
 * has no opinion on how that's drawn (see package.json's own doc comment).
 * progressToTarget/progressToBonus are 0..1, uncapped past 1 (a storefront
 * that wants an "overflow" visual, like the pasted liquid-container idea,
 * reads a value >1 as how far past the line it's spilled rather than
 * clamping it away) -- progressToBonus is null when the goal has no
 * bonusCount.
 */
export interface GoalStatus {
  goal: Goal;
  status: "locked" | "unlocked" | "bonus-unlocked";
  progressToTarget: number;
  progressToBonus: number | null;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface GoalRepository {
  get(id: string): Promise<Goal | null>;
  getBySlug(slug: string): Promise<Goal | null>;
  list(filter?: { demoSlug?: string }): Promise<Goal[]>;
  save(goal: Goal): Promise<void>;
}

/**
 * The dedup ledger behind castVote -- one row per (goalId, voterKey) that
 * has ever successfully voted. `voterKey` is caller-supplied and opaque to
 * this package: the app-composition layer decides what identifies a unique
 * voter (a signed-in customerId, or an anonymous cookie/session token for a
 * guest) -- community-goals itself has no concept of customer identity,
 * matching bundles' SkuPriceLookup-style "narrowest possible dependency"
 * discipline.
 *
 * recordIfNew MUST be atomic (check-and-set, not a separate hasVoted +
 * save) -- it is the only correctness guarantee against a voter double-
 * counting under concurrent requests. Returns true when this call is the
 * one that newly recorded the vote, false when (goalId, voterKey) already
 * existed.
 */
export interface GoalVoteRepository {
  recordIfNew(goalId: string, voterKey: string, createdAt: string): Promise<boolean>;
  hasVoted(goalId: string, voterKey: string): Promise<boolean>;
  countForGoal(goalId: string): Promise<number>;
}

/** Input to GoalsService.createGoal -- id/voteCount are always service-assigned (voteCount starts at 0). */
export type CreateGoalInput = Omit<Goal, "id" | "voteCount" | "createdAt">;

/** Thrown by createGoal/updateGoal when bonusCount is set but not greater than targetCount. */
export class InvalidGoalThresholdsError extends Error {
  constructor(targetCount: number, bonusCount: number) {
    super(`bonusCount (${bonusCount}) must be greater than targetCount (${targetCount})`);
    this.name = "InvalidGoalThresholdsError";
  }
}

/** Thrown by createGoal when a Goal with the same slug already exists. */
export class DuplicateGoalSlugError extends Error {
  constructor(slug: string) {
    super(`A goal with slug "${slug}" already exists`);
    this.name = "DuplicateGoalSlugError";
  }
}
