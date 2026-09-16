/**
 * Real, table-backed CatalogRepository/ProductCatalogRepository coverage
 * (see this package's src/catalog-entity.ts) for the real, named,
 * addressable Catalog<->Product many-to-many entity. Deliberately does NOT
 * import test/fake-pool.ts -- that shared double is reserved for the same
 * file-isolation reason as schema.ts/index.ts (several other stories are
 * adding their own self-contained persistence files to this package
 * concurrently). This file defines its own local fake Postgres Pool double,
 * matching fake-pool.ts's style and the exact, known set of SQL statements
 * catalog-entity.ts issues.
 */
import type { Catalog } from "@mercatus-liber/catalog";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCatalogRepository, createPostgresProductCatalogRepository } from "../src/catalog-entity.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakePgPool(): FakePool {
  const catalogs = new Map<string, FakeRow>();
  const assignments = new Map<string, FakeRow>(); // keyed by `${productId}::${catalogId}`

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      // --- catalogs ---
      if (sql === "SELECT * FROM catalogs WHERE id = $1") {
        const row = catalogs.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM catalogs WHERE slug = $1") {
        const row = [...catalogs.values()].find((c) => c.slug === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM catalogs") {
        return { rows: [...catalogs.values()] as T[] };
      }
      if (sql.startsWith("INSERT INTO catalogs")) {
        const [id, slug, name, description, createdAt] = values as [string, string, string, string, string];
        catalogs.set(id, { id, slug, name, description, created_at: createdAt });
        return { rows: [] };
      }

      // --- product_catalog_assignments ---
      if (sql === "SELECT product_id, catalog_id FROM product_catalog_assignments WHERE product_id = $1") {
        return { rows: [...assignments.values()].filter((a) => a.product_id === values[0]) as T[] };
      }
      if (sql === "SELECT product_id, catalog_id FROM product_catalog_assignments WHERE catalog_id = $1") {
        return { rows: [...assignments.values()].filter((a) => a.catalog_id === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO product_catalog_assignments")) {
        const [productId, catalogId] = values as [string, string];
        // Real ON CONFLICT (product_id, catalog_id) DO NOTHING semantics --
        // re-assigning an existing pair is a silent no-op, not a duplicate row.
        assignments.set(`${productId}::${catalogId}`, { product_id: productId, catalog_id: catalogId });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM product_catalog_assignments")) {
        const [productId, catalogId] = values as [string, string];
        assignments.delete(`${productId}::${catalogId}`);
        return { rows: [] };
      }

      throw new Error(`FakePool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresCatalogRepository", () => {
  let pool: FakePool;
  let catalogs: ReturnType<typeof createPostgresCatalogRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    catalogs = createPostgresCatalogRepository(pool as never);
  });

  const printShop: Catalog = {
    id: "cat1",
    slug: "print-shop",
    name: "Print Shop",
    description: "The print-shop demo store's catalog.",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("saves and retrieves a catalog by id", async () => {
    await catalogs.save(printShop);
    expect(await catalogs.get("cat1")).toEqual(printShop);
  });

  it("retrieves a catalog by slug", async () => {
    await catalogs.save(printShop);
    const found = await catalogs.getBySlug("print-shop");
    expect(found?.id).toBe("cat1");
  });

  it("returns null for a missing catalog", async () => {
    expect(await catalogs.get("missing")).toBeNull();
    expect(await catalogs.getBySlug("missing")).toBeNull();
  });

  it("lists every catalog", async () => {
    await catalogs.save(printShop);
    await catalogs.save({ ...printShop, id: "cat2", slug: "northline", name: "Northline" });
    const found = await catalogs.list();
    expect(found).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
    await catalogs.save(printShop);
    await catalogs.save({ ...printShop, name: "Print Shop & Co." });
    const found = await catalogs.get("cat1");
    expect(found?.name).toBe("Print Shop & Co.");
    expect(await catalogs.list()).toHaveLength(1);
  });

  it("round-trips createdAt", async () => {
    await catalogs.save(printShop);
    const found = await catalogs.get("cat1");
    expect(found?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("createPostgresProductCatalogRepository", () => {
  let pool: FakePool;
  let assignments: ReturnType<typeof createPostgresProductCatalogRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    assignments = createPostgresProductCatalogRepository(pool as never);
  });

  it("assigns a product to a catalog and lists both directions", async () => {
    await assignments.assign("p1", "cat1");
    expect(await assignments.listCatalogIdsForProduct("p1")).toEqual(["cat1"]);
    expect(await assignments.listProductIdsInCatalog("cat1")).toEqual(["p1"]);
  });

  it("supports a product in multiple catalogs, and a catalog with multiple products", async () => {
    await assignments.assign("p1", "cat1");
    await assignments.assign("p1", "cat2");
    await assignments.assign("p2", "cat1");

    expect(await assignments.listCatalogIdsForProduct("p1")).toEqual(expect.arrayContaining(["cat1", "cat2"]));
    expect(await assignments.listProductIdsInCatalog("cat1")).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("assign is idempotent -- assigning the same pair twice doesn't duplicate", async () => {
    await assignments.assign("p1", "cat1");
    await assignments.assign("p1", "cat1");
    expect(await assignments.listCatalogIdsForProduct("p1")).toEqual(["cat1"]);
  });

  it("unassign removes exactly the given pair", async () => {
    await assignments.assign("p1", "cat1");
    await assignments.assign("p1", "cat2");
    await assignments.unassign("p1", "cat1");
    expect(await assignments.listCatalogIdsForProduct("p1")).toEqual(["cat2"]);
  });

  it("unassigning a pair that was never assigned is a safe no-op", async () => {
    await expect(assignments.unassign("p1", "cat1")).resolves.toBeUndefined();
    expect(await assignments.listCatalogIdsForProduct("p1")).toEqual([]);
  });

  it("returns an empty array for a product/catalog with no assignments", async () => {
    expect(await assignments.listCatalogIdsForProduct("missing")).toEqual([]);
    expect(await assignments.listProductIdsInCatalog("missing")).toEqual([]);
  });
});
