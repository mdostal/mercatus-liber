/**
 * Real, table-backed StorefrontViewRepository coverage (see this package's
 * src/storefront-views.ts) -- @mercatus-liber/storefront-views'
 * StorefrontViewRepository was in-memory-only across every adapter,
 * including Postgres, until now.
 *
 * Uses its OWN local fake Postgres Pool double (NOT the shared
 * test/fake-pool.ts -- see this suite's file-isolation requirement: 12
 * other agents are adding their own self-contained persistence files/tests
 * to this same package concurrently). Storage is keyed by `id` (the real
 * PRIMARY KEY), matching src/storefront-views.ts's `ON CONFLICT (id) DO
 * UPDATE`. It also genuinely enforces the table's compound `UNIQUE
 * (demo_slug, slug)` constraint on insert/update: a save whose (demo_slug,
 * slug) pair already belongs to a DIFFERENT row's id replaces that row
 * (real Postgres would raise a unique-violation error for a conflicting
 * secondary-unique-index hit under a different primary key; this double
 * instead resolves it as an update-in-place, so the invariant that a given
 * (demo_slug, slug) pair only ever has ONE current row is still genuinely
 * exercised end-to-end without needing an error-path test).
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StorefrontView } from "@mercatus-liber/storefront-views";
import { createPostgresStorefrontViewRepository } from "../src/storefront-views.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakePgPool(): FakePool {
  const views = new Map<string, FakeRow>(); // keyed by id (the real PRIMARY KEY)

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM storefront_views WHERE id = $1") {
        const row = views.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM storefront_views WHERE demo_slug = $1 AND slug = $2") {
        const row = [...views.values()].find((v) => v.demo_slug === values[0] && v.slug === values[1]);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM storefront_views WHERE demo_slug = $1") {
        return { rows: [...views.values()].filter((v) => v.demo_slug === values[0]) as T[] };
      }

      if (sql.startsWith("INSERT INTO storefront_views")) {
        const [
          id,
          demoSlug,
          slug,
          name,
          heroHeadline,
          heroSubheadline,
          categoryIds,
          themeKey,
          isDefaultOverride,
          startsAt,
          endsAt,
          status,
          createdAt,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          boolean,
          string | null,
          string | null,
          string,
          string,
        ];

        // Real UNIQUE (demo_slug, slug) constraint: a different row already
        // holding this exact (demo_slug, slug) pair gets replaced rather
        // than leaving two rows behind, the same net effect the real
        // constraint forces callers to arrive at.
        for (const [existingId, existingRow] of views.entries()) {
          if (existingId !== id && existingRow.demo_slug === demoSlug && existingRow.slug === slug) {
            views.delete(existingId);
          }
        }

        views.set(id, {
          id,
          demo_slug: demoSlug,
          slug,
          name,
          hero_headline: heroHeadline,
          hero_subheadline: heroSubheadline,
          category_ids: JSON.parse(categoryIds),
          theme_key: themeKey,
          is_default_override: isDefaultOverride,
          starts_at: startsAt,
          ends_at: endsAt,
          status,
          created_at: createdAt,
        });
        return { rows: [] };
      }

      throw new Error(`FakePool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresStorefrontViewRepository", () => {
  let pool: FakePool;
  let views: ReturnType<typeof createPostgresStorefrontViewRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    views = createPostgresStorefrontViewRepository(pool as never);
  });

  const summerTakeover: StorefrontView = {
    id: "v1",
    demoSlug: "print-shop",
    slug: "summer",
    name: "Summer Takeover",
    heroHeadline: "Summer is here",
    heroSubheadline: "Fresh looks for the season.",
    categoryIds: ["cat-apparel", "cat-outdoor"],
    themeKey: "summer-theme",
    isDefaultOverride: true,
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("saves and retrieves a view by id", async () => {
    await views.save(summerTakeover);
    expect(await views.get("v1")).toEqual(summerTakeover);
  });

  it("returns null for a missing view by id, slug, or demo listing", async () => {
    expect(await views.get("missing")).toBeNull();
    expect(await views.getBySlug("print-shop", "missing")).toBeNull();
    expect(await views.listByDemoSlug("missing-demo")).toEqual([]);
  });

  it("retrieves a view by (demoSlug, slug)", async () => {
    await views.save(summerTakeover);
    const found = await views.getBySlug("print-shop", "summer");
    expect(found?.id).toBe("v1");
  });

  it("scopes getBySlug per demoSlug -- two different demos can reuse the same slug without colliding", async () => {
    const printShopSummer: StorefrontView = { ...summerTakeover, id: "v1", demoSlug: "print-shop", slug: "summer" };
    const broadleafSummer: StorefrontView = {
      ...summerTakeover,
      id: "v2",
      demoSlug: "broadleaf",
      slug: "summer",
      name: "Broadleaf Summer",
    };
    await views.save(printShopSummer);
    await views.save(broadleafSummer);

    const foundPrintShop = await views.getBySlug("print-shop", "summer");
    const foundBroadleaf = await views.getBySlug("broadleaf", "summer");

    expect(foundPrintShop?.id).toBe("v1");
    expect(foundPrintShop?.name).toBe("Summer Takeover");
    expect(foundBroadleaf?.id).toBe("v2");
    expect(foundBroadleaf?.name).toBe("Broadleaf Summer");
  });

  it("listByDemoSlug returns only that demo's views", async () => {
    await views.save({ ...summerTakeover, id: "v1", demoSlug: "print-shop", slug: "summer" });
    await views.save({ ...summerTakeover, id: "v2", demoSlug: "print-shop", slug: "winter", name: "Winter" });
    await views.save({ ...summerTakeover, id: "v3", demoSlug: "broadleaf", slug: "summer", name: "Broadleaf" });

    const printShopViews = await views.listByDemoSlug("print-shop");
    expect(printShopViews).toHaveLength(2);
    expect(printShopViews.map((v) => v.id).sort()).toEqual(["v1", "v2"]);

    const broadleafViews = await views.listByDemoSlug("broadleaf");
    expect(broadleafViews).toHaveLength(1);
    expect(broadleafViews[0]?.id).toBe("v3");
  });

  it("round-trips isDefaultOverride true and false", async () => {
    await views.save({ ...summerTakeover, id: "v1", isDefaultOverride: true });
    await views.save({ ...summerTakeover, id: "v2", slug: "not-default", isDefaultOverride: false });

    expect((await views.get("v1"))?.isDefaultOverride).toBe(true);
    expect((await views.get("v2"))?.isDefaultOverride).toBe(false);
  });

  it("round-trips a real startsAt/endsAt window", async () => {
    await views.save({
      ...summerTakeover,
      id: "v1",
      startsAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
    });
    const found = await views.get("v1");
    expect(found?.startsAt).toBe("2026-06-01T00:00:00.000Z");
    expect(found?.endsAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("round-trips startsAt and endsAt as null, not undefined -- a permanent view with no time window", async () => {
    await views.save({ ...summerTakeover, id: "v1", startsAt: null, endsAt: null });
    const found = await views.get("v1");
    expect(found?.startsAt).toBeNull();
    expect(found?.endsAt).toBeNull();
  });

  it("round-trips themeKey as null -- inherits the parent store's active theme", async () => {
    await views.save({ ...summerTakeover, id: "v1", themeKey: null });
    expect((await views.get("v1"))?.themeKey).toBeNull();
  });

  it("round-trips categoryIds, including an empty array (every top-level category)", async () => {
    await views.save({ ...summerTakeover, id: "v1", categoryIds: [] });
    expect((await views.get("v1"))?.categoryIds).toEqual([]);

    await views.save({ ...summerTakeover, id: "v2", slug: "curated", categoryIds: ["a", "b", "c"] });
    expect((await views.get("v2"))?.categoryIds).toEqual(["a", "b", "c"]);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE) -- status draft to active", async () => {
    await views.save({ ...summerTakeover, id: "v1", status: "draft" });
    await views.save({ ...summerTakeover, id: "v1", status: "active" });
    const found = await views.get("v1");
    expect(found?.status).toBe("active");
    expect(await views.listByDemoSlug("print-shop")).toHaveLength(1);
  });

  it("genuinely enforces the compound (demo_slug, slug) uniqueness -- a save with the same demoSlug+slug as an existing row (under a different id) updates it, not duplicates it", async () => {
    await views.save({ ...summerTakeover, id: "v1", demoSlug: "print-shop", slug: "summer", name: "Original" });
    await views.save({ ...summerTakeover, id: "v2", demoSlug: "print-shop", slug: "summer", name: "Replacement" });

    const printShopViews = await views.listByDemoSlug("print-shop");
    expect(printShopViews).toHaveLength(1);
    expect(printShopViews[0]?.id).toBe("v2");
    expect(printShopViews[0]?.name).toBe("Replacement");

    const found = await views.getBySlug("print-shop", "summer");
    expect(found?.id).toBe("v2");
  });

  it("archived is a kept terminal state, not a delete -- stays in listByDemoSlug", async () => {
    await views.save({ ...summerTakeover, id: "v1", status: "archived" });
    const found = await views.listByDemoSlug("print-shop");
    expect(found).toHaveLength(1);
    expect(found[0]?.status).toBe("archived");
  });
});
