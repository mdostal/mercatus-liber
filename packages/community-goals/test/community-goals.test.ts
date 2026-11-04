import { createInMemoryEventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { computeGoalStatus } from "../src/status.js";
import { createInMemoryGoalRepository, createInMemoryGoalVoteRepository } from "../src/in-memory-repository.js";
import { createGoalsService, type GoalsService } from "../src/service.js";
import { DuplicateGoalSlugError, InvalidGoalThresholdsError } from "../src/types.js";

describe("community-goals", () => {
  let service: GoalsService;
  let events: ReturnType<typeof createInMemoryEventBus>;
  let publishedEvents: { eventName: string; payload: unknown }[];

  beforeEach(() => {
    publishedEvents = [];
    events = createInMemoryEventBus();
    const originalPublish = events.publish.bind(events);
    events.publish = async (eventName: string, payload: unknown) => {
      publishedEvents.push({ eventName, payload });
      return originalPublish(eventName, payload);
    };
    service = createGoalsService({ repository: createInMemoryGoalRepository(), votes: createInMemoryGoalVoteRepository(), events });
  });

  describe("createGoal", () => {
    it("assigns an id, starts voteCount at 0, stamps createdAt", async () => {
      const goal = await service.createGoal({ slug: "watch-it-build", title: "Watch it build", description: "Live print stream", targetCount: 1000, bonusCount: 2000 });
      expect(goal.id).toBeTruthy();
      expect(goal.voteCount).toBe(0);
      expect(goal.createdAt).toBeTruthy();
    });

    it("rejects a bonusCount that is not greater than targetCount", async () => {
      await expect(service.createGoal({ slug: "a", title: "A", description: "", targetCount: 1000, bonusCount: 1000 })).rejects.toThrow(InvalidGoalThresholdsError);
      await expect(service.createGoal({ slug: "b", title: "B", description: "", targetCount: 1000, bonusCount: 500 })).rejects.toThrow(InvalidGoalThresholdsError);
    });

    it("rejects a duplicate slug", async () => {
      await service.createGoal({ slug: "dup", title: "First", description: "", targetCount: 10 });
      await expect(service.createGoal({ slug: "dup", title: "Second", description: "", targetCount: 20 })).rejects.toThrow(DuplicateGoalSlugError);
    });

    it("a goal with no bonusCount is valid", async () => {
      const goal = await service.createGoal({ slug: "no-bonus", title: "No bonus", description: "", targetCount: 50 });
      expect(goal.bonusCount).toBeUndefined();
    });
  });

  describe("reads", () => {
    it("getGoalBySlug and listGoals with demoSlug filter", async () => {
      await service.createGoal({ slug: "print-shop-goal", title: "A", description: "", targetCount: 10, demoSlug: "print-shop" });
      await service.createGoal({ slug: "northline-goal", title: "B", description: "", targetCount: 10, demoSlug: "northline" });

      const bySlug = await service.getGoalBySlug("print-shop-goal");
      expect(bySlug?.demoSlug).toBe("print-shop");

      const scoped = await service.listGoals({ demoSlug: "northline" });
      expect(scoped).toHaveLength(1);
      expect(scoped[0]!.slug).toBe("northline-goal");

      const unscoped = await service.listGoals();
      expect(unscoped).toHaveLength(2);
    });
  });

  describe("castVote", () => {
    it("returns null for an unknown goalId", async () => {
      expect(await service.castVote("nope", "voter-1")).toBeNull();
    });

    it("the first vote from a voterKey increments voteCount and is not alreadyVoted", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 3 });
      const result = await service.castVote(goal.id, "voter-1");
      expect(result).toEqual({ goal: { ...goal, voteCount: 1 }, alreadyVoted: false, crossedThreshold: null });
    });

    it("a repeat vote from the SAME voterKey is deduped -- alreadyVoted, voteCount unchanged", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 3 });
      await service.castVote(goal.id, "voter-1");
      const second = await service.castVote(goal.id, "voter-1");
      expect(second?.alreadyVoted).toBe(true);
      expect(second?.goal.voteCount).toBe(1);
    });

    it("crosses the target threshold exactly once, on the vote that reaches it -- not before, not again after", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 2, bonusCount: 4 });
      const first = await service.castVote(goal.id, "voter-1");
      expect(first?.crossedThreshold).toBeNull();
      const second = await service.castVote(goal.id, "voter-2");
      expect(second?.crossedThreshold).toBe("target");
      expect(second?.goal.voteCount).toBe(2);
      const third = await service.castVote(goal.id, "voter-3");
      expect(third?.crossedThreshold).toBeNull();
    });

    it("crosses the bonus threshold on the vote that reaches it, independent of target already having crossed", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 2, bonusCount: 4 });
      await service.castVote(goal.id, "voter-1");
      await service.castVote(goal.id, "voter-2"); // crosses target
      await service.castVote(goal.id, "voter-3");
      const fourth = await service.castVote(goal.id, "voter-4");
      expect(fourth?.crossedThreshold).toBe("bonus");
      expect(fourth?.goal.voteCount).toBe(4);
    });

    it("🔍 a vote that jumps past a threshold in one call still fires crossedThreshold (threshold is a >= check, not an exact-equality check)", async () => {
      // Not reachable via castVote itself (always +1), but computeGoalStatus / a
      // repository seeded with a voteCount that skips past targetCount must still
      // report "unlocked", not "locked" -- covered directly below. This test
      // documents castVote's own increment-by-one contract explicitly instead.
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 1 });
      const result = await service.castVote(goal.id, "voter-1");
      expect(result?.crossedThreshold).toBe("target");
    });

    it("publishes community-goals.vote.cast on every vote attempt, and community-goals.goal.threshold_crossed exactly once per threshold", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 1 });
      await service.castVote(goal.id, "voter-1"); // crosses target
      await service.castVote(goal.id, "voter-1"); // dedup repeat
      await service.castVote(goal.id, "voter-2"); // past threshold, no re-cross

      const voteCastEvents = publishedEvents.filter((e) => e.eventName === "community-goals.vote.cast");
      const thresholdEvents = publishedEvents.filter((e) => e.eventName === "community-goals.goal.threshold_crossed");
      expect(voteCastEvents).toHaveLength(3);
      expect(thresholdEvents).toHaveLength(1);
      expect(thresholdEvents[0]!.payload).toMatchObject({ threshold: "target", voteCountAtCrossing: 1 });
    });
  });

  describe("updateGoal", () => {
    it("merges fields but never lets input overwrite id/slug/voteCount/createdAt", async () => {
      const goal = await service.createGoal({ slug: "g", title: "Original", description: "", targetCount: 10 });
      await service.castVote(goal.id, "voter-1");
      const updated = await service.updateGoal(goal.id, { title: "Renamed", targetCount: 50 } as never);
      expect(updated?.title).toBe("Renamed");
      expect(updated?.targetCount).toBe(50);
      expect(updated?.id).toBe(goal.id);
      expect(updated?.slug).toBe("g");
      expect(updated?.voteCount).toBe(1);
      expect(updated?.createdAt).toBe(goal.createdAt);
    });

    it("re-validates thresholds on update", async () => {
      const goal = await service.createGoal({ slug: "g", title: "G", description: "", targetCount: 10, bonusCount: 20 });
      await expect(service.updateGoal(goal.id, { targetCount: 25 })).rejects.toThrow(InvalidGoalThresholdsError);
    });

    it("returns null for an unknown id", async () => {
      expect(await service.updateGoal("nope", { title: "x" })).toBeNull();
    });
  });

  describe("computeGoalStatus", () => {
    it("locked below target, unlocked at/above target, bonus-unlocked at/above bonus", () => {
      const base = { id: "1", slug: "g", title: "G", description: "", targetCount: 1000, bonusCount: 2000, createdAt: "now" };
      expect(computeGoalStatus({ ...base, voteCount: 500 }).status).toBe("locked");
      expect(computeGoalStatus({ ...base, voteCount: 1000 }).status).toBe("unlocked");
      expect(computeGoalStatus({ ...base, voteCount: 1500 }).status).toBe("unlocked");
      expect(computeGoalStatus({ ...base, voteCount: 2000 }).status).toBe("bonus-unlocked");
    });

    it("progress fractions, including past-1.0 overflow for the liquid-container spill case", () => {
      const base = { id: "1", slug: "g", title: "G", description: "", targetCount: 1000, bonusCount: 2000, createdAt: "now" };
      const atHalf = computeGoalStatus({ ...base, voteCount: 500 });
      expect(atHalf.progressToTarget).toBeCloseTo(0.5);
      expect(atHalf.progressToBonus).toBeCloseTo(0.25);

      const overflowed = computeGoalStatus({ ...base, voteCount: 2500 });
      expect(overflowed.progressToTarget).toBeCloseTo(2.5);
      expect(overflowed.progressToBonus).toBeCloseTo(1.25);
    });

    it("🔍 progressToBonus is null, not NaN/Infinity, when the goal has no bonusCount", () => {
      const status = computeGoalStatus({ id: "1", slug: "g", title: "G", description: "", targetCount: 100, voteCount: 50, createdAt: "now" });
      expect(status.progressToBonus).toBeNull();
    });
  });
});
