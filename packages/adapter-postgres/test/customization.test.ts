/**
 * Runs the customization repositories against real Postgres SQL through
 * PGlite (Postgres compiled to WASM), rather than this package's usual fake
 * pool: a fake pool only checks that the code sends the strings it expects, so
 * it can't catch bad SQL, JSONB encoding, or ordering.
 */
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { describeCustomizationRepositoryContract } from "../../customization/test/repository-contract.js";
import {
  createPostgresArtStyleRepository,
  createPostgresFinishTierRepository,
  createPostgresPaletteRepository,
  createPostgresPricingRulesRepository,
  createPostgresProductCustomizationRepository,
} from "../src/customization.js";

function poolFor(db: PGlite): Pool {
  return {
    async query(text: string, values?: unknown[]) {
      if (values) return db.query(text, values);
      const results = await db.exec(text);
      return results[results.length - 1];
    },
  } as unknown as Pool;
}

// PGlite compiles its WASM on first start, which can take several seconds.
const TIMEOUT = 30_000;

describeCustomizationRepositoryContract(
  "Postgres",
  async () => {
    const db = new PGlite();
    return {
      open() {
        const pool = poolFor(db);
        return {
          palette: createPostgresPaletteRepository(pool),
          finishTiers: createPostgresFinishTierRepository(pool),
          artStyles: createPostgresArtStyleRepository(pool),
          productCustomizations: createPostgresProductCustomizationRepository(pool),
          rules: createPostgresPricingRulesRepository(pool),
        };
      },
    };
  },
  { timeout: TIMEOUT },
);

describe("Postgres customization repositories", { timeout: TIMEOUT }, () => {
  it("🔍 stores nested shapes as real JSONB, not an encoded string", async () => {
    const db = new PGlite();
    await createPostgresPricingRulesRepository(poolFor(db)).save("chest", { basePriceCents: { ams: 1 }, attributes: [] });
    const { rows } = await db.query<{ a: string; b: string }>("SELECT jsonb_typeof(attributes) AS a, jsonb_typeof(base_price_cents) AS b FROM pricing_rules");
    expect(rows[0]).toEqual({ a: "array", b: "object" });
  });

  it("🔍 runs the schema once per pool, however many repositories share it", async () => {
    const pool = poolFor(new PGlite());
    let schemaRuns = 0;
    const counting = {
      query(text: string, values?: unknown[]) {
        if (text.includes("CREATE TABLE")) schemaRuns += 1;
        return pool.query(text, values as never);
      },
    } as unknown as Pool;
    await Promise.all([
      createPostgresPaletteRepository(counting).list(),
      createPostgresFinishTierRepository(counting).list(),
      createPostgresArtStyleRepository(counting).list(),
      createPostgresProductCustomizationRepository(counting).list(),
      createPostgresPricingRulesRepository(counting).list(),
    ]);
    expect(schemaRuns).toBe(1);
  });

  it("🔍 retries the schema after a failed attempt, so a paused database recovers", async () => {
    const pool = poolFor(new PGlite());
    let failNext = true;
    const flaky = {
      query(text: string, values?: unknown[]) {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("database paused"));
        }
        return pool.query(text, values as never);
      },
    } as unknown as Pool;
    const repo = createPostgresPaletteRepository(flaky);
    await expect(repo.list()).rejects.toThrow("database paused");
    expect(await repo.list()).toEqual([]);
  });
});
