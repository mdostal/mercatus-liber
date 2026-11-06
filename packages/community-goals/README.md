# @mercatus-liber/community-goals

Vote-driven goals for a store's community: each goal has a target, an optional bonus threshold, and one vote per voter key.

**Status:** used by the demo stores; Postgres repositories ship in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  computeGoalStatus,
  createGoalsService,
  createInMemoryGoalRepository,
  createInMemoryGoalVoteRepository,
} from "@mercatus-liber/community-goals";

const goals = createGoalsService({
  repository: createInMemoryGoalRepository(),
  votes: createInMemoryGoalVoteRepository(),
});

const result = await goals.castVote("goal-1", "voter-key");
if (result) console.log(result.alreadyVoted, result.crossedThreshold, computeGoalStatus(result.goal));
```

`castVote` returns `null` when the goal does not exist. Pass the optional `events` dep to publish goal events on the bus.

## Key exports

- `createGoalsService(deps)`: `createGoal`, `getGoal`, `getGoalBySlug`, `listGoals`, `updateGoal`, `enableGoal`, `disableGoal`, `castVote`.
- `computeGoalStatus(goal)`.
- `createInMemoryGoalRepository()`, `createInMemoryGoalVoteRepository()`.
- `GoalDisabledError`, `InvalidGoalThresholdsError`, `DuplicateGoalSlugError`.

See [docs/subsystems/26-community-goals.md](../../docs/subsystems/26-community-goals.md).
