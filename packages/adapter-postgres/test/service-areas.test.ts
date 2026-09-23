/**
 * Real, table-backed ServiceAreaRepository/ServiceAreaProductRepository
 * coverage (see this package's src/service-areas.ts) -- these were
 * in-memory-only across every adapter, including Postgres, until now.
 * Structurally identical to categories.test.ts's coverage of
 * CategoryRepository/ProductCategoryRepository, but uses its OWN local fake
 * Postgres Pool double (not the shared test/fake-pool.ts) so this file stays
 * fully self-contained per the file-isolation rule for this concurrent
 * persistence-audit story.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createPostgresServiceAreaProductRepository,
  createPostgresServiceAreaRepository,
  type ServiceArea,
} from "../src/service-areas.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakePgPool(): FakePool {
  const serviceAreas = new Map<string, FakeRow>();
  const assignments = new Map<string, FakeRow>(); // keyed by `${productId}::${serviceAreaId}`

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      // --- service_areas ---
      if (sql === "SELECT * FROM service_areas WHERE id = $1") {
        const row = serviceAreas.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM service_areas WHERE slug = $1") {
        const row = [...serviceAreas.values()].find((a) => a.slug === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM service_areas WHERE demo_slug = $1") {
        return { rows: [...serviceAreas.values()].filter((a) => a.demo_slug === values[0]) as T[] };
      }
      if (sql === "SELECT * FROM service_areas") {
        return { rows: [...serviceAreas.values()] as T[] };
      }
      if (sql.startsWith("INSERT INTO service_areas")) {
        const [id, slug, name, region, description, phone, demoSlug] = values as [
          string,
          string,
          string,
          string,
          string,
          string | null,
          string | null,
        ];
        serviceAreas.set(id, { id, slug, name, region, description, phone, demo_slug: demoSlug });
        return { rows: [] };
      }

      // --- service_area_product_assignments ---
      if (
        sql ===
        "SELECT product_id, service_area_id FROM service_area_product_assignments WHERE product_id = $1"
      ) {
        return { rows: [...assignments.values()].filter((a) => a.product_id === values[0]) as T[] };
      }
      if (
        sql ===
        "SELECT product_id, service_area_id FROM service_area_product_assignments WHERE service_area_id = $1"
      ) {
        return { rows: [...assignments.values()].filter((a) => a.service_area_id === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO service_area_product_assignments")) {
        const [productId, serviceAreaId] = values as [string, string];
        // Real ON CONFLICT (product_id, service_area_id) DO NOTHING semantics
        // -- re-assigning an existing pair is a silent no-op, not a
        // duplicate row.
        assignments.set(`${productId}::${serviceAreaId}`, {
          product_id: productId,
          service_area_id: serviceAreaId,
        });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM service_area_product_assignments")) {
        const [productId, serviceAreaId] = values as [string, string];
        assignments.delete(`${productId}::${serviceAreaId}`);
        return { rows: [] };
      }

      throw new Error(`FakePool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresServiceAreaRepository", () => {
  let pool: FakePool;
  let serviceAreas: ReturnType<typeof createPostgresServiceAreaRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    serviceAreas = createPostgresServiceAreaRepository(pool as never);
  });

  const royseCity: ServiceArea = {
    id: "sa1",
    slug: "royse-city-tx",
    name: "Royse City, TX",
    region: "Texas",
    description: "Serving Royse City and the surrounding area.",
    phone: "555-0100",
  };

  it("saves and retrieves a service area by id", async () => {
    await serviceAreas.save(royseCity);
    expect(await serviceAreas.get("sa1")).toEqual(royseCity);
  });

  it("retrieves a service area by slug", async () => {
    await serviceAreas.save(royseCity);
    const found = await serviceAreas.getBySlug("royse-city-tx");
    expect(found?.id).toBe("sa1");
  });

  it("returns null for a missing service area", async () => {
    expect(await serviceAreas.get("missing")).toBeNull();
    expect(await serviceAreas.getBySlug("missing")).toBeNull();
  });

  it("lists every service area", async () => {
    await serviceAreas.save(royseCity);
    await serviceAreas.save({ ...royseCity, id: "sa2", slug: "greenville-tx", name: "Greenville, TX" });
    const found = await serviceAreas.list();
    expect(found).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
    await serviceAreas.save(royseCity);
    await serviceAreas.save({ ...royseCity, name: "Royse City, Texas (updated)" });
    const found = await serviceAreas.get("sa1");
    expect(found?.name).toBe("Royse City, Texas (updated)");
    expect(await serviceAreas.list()).toHaveLength(1);
  });

  it("round-trips a null phone as null, not undefined", async () => {
    await serviceAreas.save({ ...royseCity, phone: null });
    const found = await serviceAreas.get("sa1");
    expect(found?.phone).toBeNull();
  });

  it("round-trips a real phone value", async () => {
    await serviceAreas.save(royseCity);
    const found = await serviceAreas.get("sa1");
    expect(found?.phone).toBe("555-0100");
  });

  /**
   * commerce-gap-audit-3: a real, live finding -- print-shop's own 3
   * local-pickup service areas and Northline Home Tech's 8 installer
   * service areas both live in the same shared Postgres `service_areas`
   * table (both demos resolve the same global DATABASE_URL pool with no
   * per-demo persistence override configured). An unscoped list() returned
   * both demos' areas combined -- confirmed live against
   * commerce.mdostal.com before this fix. Proves the fix: list(filter)
   * scopes by demo_slug, and an unscoped list() (no filter) still returns
   * everything -- same shape as categories.test.ts's own demoSlug test.
   */
  it("list(filter) scopes by demoSlug -- two demos' service areas never bleed into each other's results", async () => {
    const printShop: ServiceArea = { ...royseCity, id: "sa-print-shop", slug: "portland-or", demoSlug: "print-shop" };
    const northline: ServiceArea = { ...royseCity, id: "sa-northline", slug: "cedarbrook-oh", demoSlug: "northline" };
    await serviceAreas.save(printShop);
    await serviceAreas.save(northline);

    const printShopOnly = await serviceAreas.list({ demoSlug: "print-shop" });
    expect(printShopOnly).toEqual([printShop]);

    const northlineOnly = await serviceAreas.list({ demoSlug: "northline" });
    expect(northlineOnly).toEqual([northline]);

    const everything = await serviceAreas.list();
    expect(everything.map((a) => a.id).sort()).toEqual(["sa-northline", "sa-print-shop"]);
  });

  it("round-trips demoSlug through save/get, and omits it entirely when never set (backward compatible)", async () => {
    await serviceAreas.save(royseCity);
    const found = await serviceAreas.get("sa1");
    expect(found?.demoSlug).toBeUndefined();
    expect(found).not.toHaveProperty("demoSlug");
  });
});

describe("createPostgresServiceAreaProductRepository", () => {
  let pool: FakePool;
  let assignments: ReturnType<typeof createPostgresServiceAreaProductRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    assignments = createPostgresServiceAreaProductRepository(pool as never);
  });

  it("assigns a product to a service area and lists both directions", async () => {
    await assignments.assign("p1", "sa1");
    expect(await assignments.listServiceAreaIdsForProduct("p1")).toEqual(["sa1"]);
    expect(await assignments.listProductIdsInServiceArea("sa1")).toEqual(["p1"]);
  });

  it("supports a product in multiple service areas, and a service area with multiple products", async () => {
    await assignments.assign("p1", "sa1");
    await assignments.assign("p1", "sa2");
    await assignments.assign("p2", "sa1");

    expect(await assignments.listServiceAreaIdsForProduct("p1")).toEqual(expect.arrayContaining(["sa1", "sa2"]));
    expect(await assignments.listProductIdsInServiceArea("sa1")).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("assign is idempotent -- assigning the same pair twice doesn't duplicate", async () => {
    await assignments.assign("p1", "sa1");
    await assignments.assign("p1", "sa1");
    expect(await assignments.listServiceAreaIdsForProduct("p1")).toEqual(["sa1"]);
  });

  it("unassign removes exactly the given pair", async () => {
    await assignments.assign("p1", "sa1");
    await assignments.assign("p1", "sa2");
    await assignments.unassign("p1", "sa1");
    expect(await assignments.listServiceAreaIdsForProduct("p1")).toEqual(["sa2"]);
  });

  it("unassigning a pair that was never assigned is a safe no-op", async () => {
    await expect(assignments.unassign("p1", "sa1")).resolves.toBeUndefined();
    expect(await assignments.listServiceAreaIdsForProduct("p1")).toEqual([]);
  });

  it("returns an empty array for a product/service-area with no assignments", async () => {
    expect(await assignments.listServiceAreaIdsForProduct("missing")).toEqual([]);
    expect(await assignments.listProductIdsInServiceArea("missing")).toEqual([]);
  });
});
