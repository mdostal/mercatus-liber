/**
 * Runs the customization repositories against real Postgres SQL through
 * PGlite (Postgres compiled to WASM), rather than this package's usual fake
 * pool: a fake pool only checks that the code sends the strings it expects, so
 * it can't catch bad SQL, JSONB encoding, or ordering.
 */
import { PGlite } from "@electric-sql/pglite";
import {
  createCustomizationService,
  createPricingService,
  resolvePrice,
  type FinishTier,
  type PaletteColor,
  type PricingRules,
  type ProductCustomization,
} from "@mercatus-liber/customization";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
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

const FULL_COLOR: PaletteColor = { id: "dawn", label: "Dawn silk", hex: "#C98FB0", kind: "multi", hexes: ["#F2A0B8", "#F2D060"], material: "silk", status: "request", note: "Ask first" };
const AMS: FinishTier = { id: "ams", rank: 2, label: "Multicolor", colors: "palette", description: "One print", producesSeparateParts: false };
const FULL_RULES: PricingRules = {
  basePriceCents: { solid: 5900, ams: 8300 },
  attributes: [
    { id: "contrast", label: "Contrast", perUnitCents: 450 },
    { id: "discount", label: "Discount", perUnitCents: -100 },
    { id: "metal", label: "Metal", perUnitCents: 0, quoteOnly: true },
  ],
  contrastRules: [{ attributeId: "contrast", regions: ["straps"], core: ["body"] }],
  colorMarkupCents: { dawn: 500 },
  estimatedMinutes: { solid: 837, ams: 3642 },
  excessUnitRules: [{ attributeId: "contrast", source: "nameLength", freeUnits: 8, unitsPerExcess: 2 }],
};

// PGlite compiles its WASM on first start, which can take several seconds.
describe("Postgres customization repositories", { timeout: 30_000 }, () => {
  let db: PGlite;
  let pool: Pool;

  beforeEach(async () => {
    db = new PGlite();
    pool = poolFor(db);
  });

  it("round-trips a palette color with every optional field", async () => {
    const repo = createPostgresPaletteRepository(pool);
    await repo.save(FULL_COLOR);
    expect(await repo.list()).toEqual([FULL_COLOR]);
  });

  it("returns absent optional fields as absent, not null", async () => {
    const repo = createPostgresPaletteRepository(pool);
    await repo.save({ id: "black", label: "Black", hex: "#141414" });
    expect(await repo.list()).toStrictEqual([{ id: "black", label: "Black", hex: "#141414" }]);
  });

  it("🔍 lists palette colors in insertion order, and an upsert keeps a color's position", async () => {
    const repo = createPostgresPaletteRepository(pool);
    for (const id of ["white", "black", "red"]) await repo.save({ id, label: id, hex: "#000000" });
    await repo.save({ id: "white", label: "Bright white", hex: "#FFFFFF" });
    const listed = await repo.list();
    expect(listed.map((c) => c.id)).toEqual(["white", "black", "red"]);
    expect(listed[0]!.label).toBe("Bright white");
  });

  it("clears an optional field when an upsert drops it", async () => {
    const repo = createPostgresPaletteRepository(pool);
    await repo.save(FULL_COLOR);
    await repo.save({ id: "dawn", label: "Dawn", hex: "#C98FB0" });
    expect(await repo.list()).toStrictEqual([{ id: "dawn", label: "Dawn", hex: "#C98FB0" }]);
  });

  it("lists finish tiers by rank and keeps producesSeparateParts", async () => {
    const repo = createPostgresFinishTierRepository(pool);
    const separate: FinishTier = { id: "separate", rank: 3, label: "Separate", colors: "palette", description: "Parts", producesSeparateParts: true, status: "discontinued", note: "Paused" };
    await repo.save(separate);
    await repo.save(AMS);
    expect(await repo.list()).toEqual([AMS, separate]);
  });

  it("round-trips art styles in insertion order", async () => {
    const repo = createPostgresArtStyleRepository(pool);
    await repo.save({ id: "raised", label: "Raised", description: "Up", status: "request", note: "Soon" });
    await repo.save({ id: "flush", label: "Flush", description: "Level" });
    expect(await repo.list()).toEqual([
      { id: "raised", label: "Raised", description: "Up", status: "request", note: "Soon" },
      { id: "flush", label: "Flush", description: "Level" },
    ]);
  });

  it("round-trips a product customization and finds it by id and product id", async () => {
    const repo = createPostgresProductCustomizationRepository(pool);
    const customization: ProductCustomization = {
      id: "c1",
      productId: "chest",
      finishIds: ["ams", "solid"],
      regions: [
        { id: "body", label: "Body", defaultHex: "#141414", separable: true },
        { id: "coils", label: "Coils", defaultHex: "#F4F4F2", separable: false, parentRegionId: "body", allowedColorIds: ["white"], why: "LEDs" },
      ],
      bundledProductIds: ["a", "b"],
      artStyleIds: ["flush"],
      why: "Limited",
    };
    await repo.save(customization);
    expect(await repo.get("c1")).toEqual(customization);
    expect(await repo.getByProductId("chest")).toEqual(customization);
    expect(await repo.list()).toEqual([customization]);
    expect(await repo.get("missing")).toBeNull();
    expect(await repo.getByProductId("missing")).toBeNull();
  });

  it("🔍 getByProductId returns the first saved when a product has two", async () => {
    const repo = createPostgresProductCustomizationRepository(pool);
    await repo.save({ id: "first", productId: "chest", finishIds: [], regions: [] });
    await repo.save({ id: "second", productId: "chest", finishIds: [], regions: [] });
    expect((await repo.getByProductId("chest"))!.id).toBe("first");
  });

  it("round-trips full pricing rules, one document per product", async () => {
    const repo = createPostgresPricingRulesRepository(pool);
    await repo.save("chest", FULL_RULES);
    await repo.save("caddy", { basePriceCents: { solid: 100 }, attributes: [] });
    expect(await repo.get("chest")).toEqual(FULL_RULES);
    expect(await repo.get("caddy")).toStrictEqual({ basePriceCents: { solid: 100 }, attributes: [] });
    expect(await repo.get("missing")).toBeNull();
    expect(Object.keys(await repo.list()).sort()).toEqual(["caddy", "chest"]);
    await repo.save("caddy", { basePriceCents: { solid: 200 }, attributes: [] });
    expect((await repo.get("caddy"))!.basePriceCents.solid).toBe(200);
  });

  it("🔍 stores nested shapes as real JSONB, not an encoded string", async () => {
    await createPostgresPricingRulesRepository(pool).save("chest", FULL_RULES);
    const { rows } = await db.query<{ a: string; b: string }>("SELECT jsonb_typeof(attributes) AS a, jsonb_typeof(base_price_cents) AS b FROM pricing_rules");
    expect(rows[0]).toEqual({ a: "array", b: "object" });
  });

  it("🔍 data survives a restart: new repositories on the same database still see it", async () => {
    await createPostgresPricingRulesRepository(pool).save("chest", FULL_RULES);
    expect(await createPostgresPricingRulesRepository(poolFor(db)).get("chest")).toEqual(FULL_RULES);
  });

  it("🔍 runs the schema once per pool, however many repositories share it", async () => {
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

  it("works end to end through both services: an admin's price edit survives and charges a markup", async () => {
    const service = createCustomizationService({
      palette: createPostgresPaletteRepository(pool),
      finishTiers: createPostgresFinishTierRepository(pool),
      artStyles: createPostgresArtStyleRepository(pool),
      productCustomizations: createPostgresProductCustomizationRepository(pool),
    });
    await service.setPaletteColor({ id: "black", label: "Black", hex: "#141414" });
    await service.setPaletteColor(FULL_COLOR);
    await service.setFinishTier(AMS);
    const created = await service.createProductCustomization({
      productId: "chest",
      finishIds: ["ams"],
      regions: [
        { id: "body", label: "Body", defaultHex: "#141414", separable: true },
        { id: "straps", label: "Straps", defaultHex: "#141414", separable: true },
      ],
    });
    const colors = await service.resolveEffectiveColors(created.id, "ams", { body: "black", straps: "dawn" });
    expect(colors).toEqual({ body: "black", straps: "dawn" });

    const pricing = createPricingService({ rules: createPostgresPricingRulesRepository(pool) });
    await pricing.saveRules("chest", { basePriceCents: { ams: 8300 }, attributes: [], colorMarkupCents: { dawn: 500 } });
    const reloaded = await createPricingService({ rules: createPostgresPricingRulesRepository(poolFor(db)) }).getRules("chest");
    expect(resolvePrice(reloaded!, { finish: "ams", colors }).total).toBe(8800);
  });
});
