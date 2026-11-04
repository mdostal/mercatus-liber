import type { Goal, GoalStatus } from "./types.js";

/**
 * Pure derivation, no I/O -- see GoalStatus's own doc comment for why this
 * is never cached onto the Goal record. Safe to call client-side against a
 * server-fetched Goal without round-tripping through the service again.
 */
export function computeGoalStatus(goal: Goal): GoalStatus {
  const status = goal.bonusCount !== undefined && goal.voteCount >= goal.bonusCount ? "bonus-unlocked" : goal.voteCount >= goal.targetCount ? "unlocked" : "locked";

  return {
    goal,
    status,
    progressToTarget: goal.targetCount > 0 ? goal.voteCount / goal.targetCount : 1,
    progressToBonus: goal.bonusCount !== undefined && goal.bonusCount > 0 ? goal.voteCount / goal.bonusCount : null,
  };
}
