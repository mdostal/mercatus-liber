/**
 * Real, table-backed RecommendationRepository coverage (see this package's
 * src/recommendations.ts) -- @mercatus-liber/recommendations'
 * RecommendationRepository was in-memory-only across every adapter,
 * including Postgres, until now. This test file defines its OWN local fake
 * Postgres Pool double (deliberately not shared with test/fake-pool.ts --
 * see this file's story: 12 other agents are concurrently adding their own
 * self-contained adapter files/tests to this same package right now).
 */
import type { RecommendationRule } from "@mercatus-liber/recommendations";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresRecommendationRepository } from "../src/recommendations.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeRecommendationsPool(): FakePool {
  const rules = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM recommendation_rules WHERE id = $1") {
        const row = rules.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM recommendation_rules") {
        return { rows: [...rules.values()] as T[] };
      }
      if (sql.startsWith("INSERT INTO recommendation_rules")) {
        const [id, sourceProductId, label, placement, targetProductIds, status] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        rules.set(id, {
          id,
          source_product_id: sourceProductId,
          label,
          placement,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here.
          target_product_ids: JSON.parse(targetProductIds),
          status,
        });
        return { rows: [] };
      }

      throw new Error(`FakeRecommendationsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresRecommendationRepository", () => {
  let pool: FakePool;
  let recommendations: ReturnType<typeof createPostgresRecommendationRepository>;

  beforeEach(() => {
    pool = createFakeRecommendationsPool();
    recommendations = createPostgresRecommendationRepository(pool as never);
  });

  const rule: RecommendationRule = {
    id: "r1",
    sourceProductId: "p1",
    label: "Customers also bought",
    placement: "pdp",
    targetProductIds: ["p2", "p3"],
    status: "active",
  };

  it("saves and retrieves a rule by id, preserving targetProductIds order (not just membership)", async () => {
    await recommendations.save(rule);
    const found = await recommendations.get("r1");
    expect(found).toEqual(rule);
    expect(found?.targetProductIds).toEqual(["p2", "p3"]);
  });

  it("round-trips an ordered multi-target list exactly, for all 3 placements", async () => {
    const placements: RecommendationRule["placement"][] = ["pdp", "cart", "both"];
    for (const placement of placements) {
      const id = `r-${placement}`;
      const withPlacement: RecommendationRule = {
        ...rule,
        id,
        placement,
        targetProductIds: ["p5", "p4", "p6"],
      };
      await recommendations.save(withPlacement);
      const found = await recommendations.get(id);
      expect(found?.placement).toBe(placement);
      expect(found?.targetProductIds).toEqual(["p5", "p4", "p6"]);
    }
  });

  it("returns null for a missing rule", async () => {
    expect(await recommendations.get("missing")).toBeNull();
  });

  it("lists every rule", async () => {
    await recommendations.save(rule);
    await recommendations.save({ ...rule, id: "r2", sourceProductId: "p9" });
    const found = await recommendations.list();
    expect(found).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE) -- status active -> inactive round-trips", async () => {
    await recommendations.save(rule);
    await recommendations.save({ ...rule, status: "inactive" });
    const found = await recommendations.get("r1");
    expect(found?.status).toBe("inactive");
    expect(await recommendations.list()).toHaveLength(1);
  });
});
