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

describe("sales catalogs on real Postgres (PGlite)", () => {
  it("adds the columns to an existing catalogs table and round-trips a line", async () => {
    const { createPostgresCatalogRepository } = await import("../src/catalog-entity.js");
    const db = new PGlite();
    await db.exec("CREATE TABLE catalogs (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL)");
    await db.query("INSERT INTO catalogs VALUES ('m', 'shop', 'Shop', '', '2026-01-01T00:00:00.000Z')");
    const repo = createPostgresCatalogRepository(poolFor(db));
    expect(await repo.get("m")).toEqual({ id: "m", slug: "shop", name: "Shop", description: "", createdAt: "2026-01-01T00:00:00.000Z" });
    const line = {
      id: "l1",
      slug: "frost",
      name: "Frost",
      description: "",
      createdAt: "2026-11-21T00:00:00.000Z",
      kind: "sales" as const,
      masterCatalogId: "m",
      status: "active" as const,
      activeFrom: "2026-11-30T18:00:00.000Z",
      activeTo: "2026-12-07T18:00:00.000Z",
      hero: { title: "Frost", subtitle: "One week", cta: { label: "Shop", href: "/lines/frost" } },
      sections: [{ slug: "desk", title: "Desk", productIds: ["p1"] }, { slug: "hats", title: "Hats", productIds: [] }],
    };
    await repo.save(line);
    expect(await repo.getBySlug("frost")).toEqual(line);
    const { activeTo: _gone, ...open } = line;
    await repo.save(open);
    expect("activeTo" in (await repo.get("l1"))!).toBe(false);
  });
});
