/**
 * Real, table-backed StorefrontViewRepository coverage (see this package's
 * src/storefront-views.ts) -- @mercatus-liber/storefront-views'
 * StorefrontViewRepository was in-memory-only across every backend,
 * including Postgres, until now. Per this package's cart.test.ts/orders.ts
 * isolation precedent, this test defines its OWN local fake `pg` Pool double
 * (not the shared test/fake-pool.ts) -- same style/shape as fake-pool.ts's
 * header comment describes, scoped to exactly the `storefront_views` table
 * and the fixed set of SQL statements src/storefront-views.ts issues. This
 * avoids concurrent-edit collisions with other agents extending the shared
 * fake-pool.ts for their own tables in parallel.
 *
 * Deliberately does NOT simulate a UNIQUE(demo_slug, slug) constraint --
 * src/storefront-views.ts's own schema comment explains why one isn't
 * added: the real duplicate-slug guard lives in the service layer
 * (publishView), which only rejects a clash between two *active* views;
 * two *draft* views sharing a slug for the same demoSlug is a real,
 * intentionally-allowed case (see storefront-views' publishView doc
 * comment), so this suite asserts that case stays allowed end-to-end.
 */
import type { StorefrontView } from "@mercatus-liber/storefront-views";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorefrontViewRepository } from "../src/storefront-views.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeStorefrontViewsPool(): FakePool {
  const views = new Map<string, FakeRow>();

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
        views.set(id, {
          id,
          demo_slug: demoSlug,
          slug,
          name,
          hero_headline: heroHeadline,
          hero_subheadline: heroSubheadline,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here the same way
          // fake-pool.ts's products.identifying_attribute_keys is.
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

      throw new Error(`FakeStorefrontViewsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresStorefrontViewRepository", () => {
  let pool: FakePool;
  let views: ReturnType<typeof createPostgresStorefrontViewRepository>;

  beforeEach(() => {
    pool = createFakeStorefrontViewsPool();
    views = createPostgresStorefrontViewRepository(pool as never);
  });

  const seasonal: StorefrontView = {
    id: "v1",
    demoSlug: "print-shop",
    slug: "winter-sale",
    name: "Winter Sale",
    heroHeadline: "Cozy up with 20% off",
    heroSubheadline: "Through January.",
    categoryIds: ["c-apparel", "c-gifts"],
    themeKey: "winter",
    isDefaultOverride: true,
    startsAt: "2026-12-01T00:00:00.000Z",
    endsAt: "2027-01-15T00:00:00.000Z",
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
  };

  it("returns null for an unknown view id", async () => {
    expect(await views.get("missing")).toBeNull();
  });

  it("saves and retrieves a view by id, round-tripping every field", async () => {
    await views.save(seasonal);
    expect(await views.get("v1")).toEqual(seasonal);
  });

  it("round-trips a view with null themeKey, startsAt, and endsAt", async () => {
    const permanent: StorefrontView = {
      ...seasonal,
      id: "v2",
      slug: "second-storefront",
      themeKey: null,
      startsAt: null,
      endsAt: null,
      isDefaultOverride: false,
      status: "draft",
    };
    await views.save(permanent);
    const found = await views.get("v2");
    expect(found?.themeKey).toBeNull();
    expect(found?.startsAt).toBeNull();
    expect(found?.endsAt).toBeNull();
    expect(found).toEqual(permanent);
  });

  it("getBySlug is scoped by demoSlug -- two views with the same slug in different demos don't collide", async () => {
    const printShopView: StorefrontView = { ...seasonal, id: "v3", demoSlug: "print-shop", slug: "launch" };
    const broadleafView: StorefrontView = { ...seasonal, id: "v4", demoSlug: "broadleaf", slug: "launch" };
    await views.save(printShopView);
    await views.save(broadleafView);

    const foundPrintShop = await views.getBySlug("print-shop", "launch");
    const foundBroadleaf = await views.getBySlug("broadleaf", "launch");

    expect(foundPrintShop?.id).toBe("v3");
    expect(foundBroadleaf?.id).toBe("v4");
  });

  it("getBySlug returns null when the slug exists but for a different demoSlug", async () => {
    await views.save({ ...seasonal, id: "v5", demoSlug: "print-shop", slug: "only-here" });
    expect(await views.getBySlug("broadleaf", "only-here")).toBeNull();
  });

  it("listByDemoSlug returns only that demo's views, not every view", async () => {
    await views.save({ ...seasonal, id: "v6", demoSlug: "print-shop", slug: "a" });
    await views.save({ ...seasonal, id: "v7", demoSlug: "print-shop", slug: "b" });
    await views.save({ ...seasonal, id: "v8", demoSlug: "broadleaf", slug: "c" });

    const found = await views.listByDemoSlug("print-shop");
    expect(found.map((v) => v.id).sort()).toEqual(["v6", "v7"]);
  });

  it("listByDemoSlug returns an empty array for a demoSlug with no views", async () => {
    expect(await views.listByDemoSlug("no-such-demo")).toEqual([]);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE) -- e.g. draft -> active via publishView", async () => {
    const draft: StorefrontView = { ...seasonal, id: "v9", status: "draft" };
    await views.save(draft);
    await views.save({ ...draft, status: "active" });

    const found = await views.get("v9");
    expect(found?.status).toBe("active");
    expect(await views.listByDemoSlug("print-shop")).toHaveLength(1);
  });

  it("allows two draft views for the same demoSlug to share a slug (no DB-level UNIQUE(demo_slug, slug))", async () => {
    const draftA: StorefrontView = { ...seasonal, id: "v10", slug: "preview", status: "draft" };
    const draftB: StorefrontView = { ...seasonal, id: "v11", slug: "preview", status: "draft" };
    await views.save(draftA);
    await views.save(draftB);

    const found = await views.listByDemoSlug("print-shop");
    expect(found.map((v) => v.id).sort()).toEqual(["v10", "v11"]);
  });
});
