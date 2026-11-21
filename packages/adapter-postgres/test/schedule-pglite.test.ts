import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createPostgresAdapter } from "../src/index.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query } as unknown as Pool;
}

describe("schedules on real Postgres (PGlite)", () => {
  it("adds the columns to an existing database and round-trips product and SKU windows", { timeout: 30_000 }, async () => {
    const db = new PGlite();
    // A database created before the columns existed.
    await db.exec("CREATE TABLE products (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, identifying_attribute_keys JSONB NOT NULL, status TEXT NOT NULL)");
    const adapter = await createPostgresAdapter(poolFor(db));
    const product = { id: "p1", slug: "fleece", title: "Fleece", description: "", identifyingAttributeKeys: ["size"], status: "active" as const, activeFrom: "2026-11-30T18:00:00.000Z", activeTo: "2026-12-07T18:00:00.000Z" };
    await adapter.products.save(product);
    expect(await adapter.products.get("p1")).toEqual(product);
    const sku = { id: "s1", productId: "p1", identifyingAttributes: [{ key: "size", value: "M" }], price: { amount: 3000, currency: "USD" }, status: "active" as const, activeTo: "2026-12-07T18:00:00.000Z" };
    await adapter.skus.save(sku);
    expect(await adapter.skus.get("s1")).toEqual(sku);
  });
});
