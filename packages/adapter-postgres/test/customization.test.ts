/**
 * Runs the customization repositories against real Postgres SQL through
 * PGlite (Postgres compiled to WASM), rather than this package's usual fake
 * pool: a fake pool only checks that the code sends the strings it expects, so
 * it can't catch bad SQL, JSONB encoding, or ordering.
 */
import { PGlite } from "@electric-sql/pglite";
import type { LineCustomization } from "@mercatus-liber/core";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { describeCustomizationRepositoryContract } from "../../customization/test/repository-contract.js";
import { describeCatalogMappingContract } from "../../fulfillment/test/catalog-mapping-contract.js";
import { createPostgresProviderCatalogMappingRepository } from "../src/provider-catalog-mappings.js";
import { createPostgresCartRepository } from "../src/cart.js";
import { createPostgresOrderRepository } from "../src/orders.js";
import {
  createPostgresArtStyleRepository,
  createPostgresFinishTierRepository,
  createPostgresPaletteRepository,
  createPostgresPricingRulesRepository,
  createPostgresProductCustomizationRepository,
} from "../src/customization.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
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

describeCatalogMappingContract(
  "Postgres",
  async () => {
    const db = new PGlite();
    return { open: () => createPostgresProviderCatalogMappingRepository(poolFor(db)) };
  },
  { timeout: TIMEOUT },
);

describe("customized lines on Postgres", { timeout: TIMEOUT }, () => {
  const customization: LineCustomization = {
    finish: "ams",
    colorMode: "palette",
    colors: { body: "red" },
    picks: { lock_position: "none" },
    variant: "none",
    name: "Your Name",
    requests: [{ kind: "color", id: "pink", at: "body" }],
  };

  it("🔍 a cart keeps a line's customization and id, and leaves a plain line without them", async () => {
    const repo = createPostgresCartRepository(poolFor(new PGlite()));
    const items = [
      { skuId: "s1", quantity: 1, priceSnapshot: { amount: 8000, currency: "USD" }, customization, lineId: "l1" },
      { skuId: "s2", quantity: 2, priceSnapshot: { amount: 100, currency: "USD" } },
    ];
    await repo.save({ id: "c1", items });
    expect((await repo.get("c1"))!.items).toStrictEqual(items);
  });

  it("🔍 an existing cart table gains the new columns without losing rows", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE carts (id TEXT PRIMARY KEY);
      CREATE TABLE cart_items (id SERIAL PRIMARY KEY, cart_id TEXT NOT NULL REFERENCES carts(id), sku_id TEXT NOT NULL, quantity INTEGER NOT NULL, price_amount INTEGER NOT NULL, price_currency TEXT NOT NULL, customization_note TEXT);
      INSERT INTO carts VALUES ('old');
      INSERT INTO cart_items (cart_id, sku_id, quantity, price_amount, price_currency) VALUES ('old', 's', 1, 5, 'USD');
    `);
    const cart = await createPostgresCartRepository(poolFor(db)).get("old");
    expect(cart!.items).toStrictEqual([{ skuId: "s", quantity: 1, priceSnapshot: { amount: 5, currency: "USD" } }]);
  });

  it("🔍 an order keeps a line's customization", async () => {
    const repo = createPostgresOrderRepository(poolFor(new PGlite()));
    await repo.save({
      id: "o1",
      cartId: "c1",
      idempotencyKey: "k1",
      items: [{ skuId: "s1", quantity: 1, priceAtPurchase: { amount: 8000, currency: "USD" }, customization }],
      status: "pending_payment",
      shippingInfo: { name: "n", email: "e" } as never,
      paymentSessionId: null,
      paymentRedirectUrl: null,
      customerId: null,
      discountTotal: { amount: 0, currency: "USD" },
      appliedPromotionCode: null,
      createdAt: "2026-11-05T00:00:00.000Z",
    });
    expect((await repo.get("o1"))!.items[0]!.customization).toEqual(customization);
  });
});

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
