/**
 * Real, table-backed CampaignRepository coverage (see this package's
 * src/advertising.ts) -- @mercatus-liber/advertising's CampaignRepository
 * was in-memory-only across every adapter, including Postgres, until now.
 *
 * Uses its OWN local fake Postgres Pool double, deliberately not the shared
 * test/fake-pool.ts -- this file is self-contained per this package's
 * file-isolation convention while multiple persistence subsystems land in
 * parallel (see accounts.test.ts for the same convention). starts_at/
 * ends_at are real TIMESTAMPTZ columns in Postgres, so this double mimics
 * the driver's own behavior of handing back a Date for a non-null value
 * (src/advertising.ts's rowToCampaign normalizes that back to an ISO
 * string) while passing null through untouched.
 */
import type { Campaign } from "@mercatus-liber/advertising";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCampaignRepository } from "../src/advertising.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeAdvertisingPool(): FakePool {
  const campaigns = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM campaigns WHERE id = $1") {
        const row = campaigns.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM campaigns") {
        return { rows: [...campaigns.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO campaigns")) {
        const [
          id,
          name,
          status,
          startsAt,
          endsAt,
          targetingServiceAreaId,
          targetingPageSlug,
          creatives,
        ] = values as [
          string,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string | null,
          string,
        ];
        campaigns.set(id, {
          id,
          name,
          status,
          // Real TIMESTAMPTZ -- the pg driver hands back a Date for a
          // non-null value, and null straight through for a null one.
          starts_at: startsAt === null ? null : new Date(startsAt),
          ends_at: endsAt === null ? null : new Date(endsAt),
          targeting_service_area_id: targetingServiceAreaId,
          targeting_page_slug: targetingPageSlug,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here.
          creatives: JSON.parse(creatives),
        });
        return { rows: [] };
      }

      throw new Error(`FakeAdvertisingPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresCampaignRepository", () => {
  let pool: FakePool;
  let campaigns: ReturnType<typeof createPostgresCampaignRepository>;

  beforeEach(() => {
    pool = createFakeAdvertisingPool();
    campaigns = createPostgresCampaignRepository(pool as never);
  });

  const summerSale: Campaign = {
    id: "camp-1",
    name: "Summer Sale",
    status: "active",
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-08-31T23:59:59.000Z",
    targeting: { serviceAreaId: "area-west", pageSlug: "home" },
    creatives: [
      {
        id: "creative-1",
        headline: "Summer Sale is here",
        body: "Up to 30% off select items.",
        imageUrl: "https://example.com/summer.png",
        linkHref: "/sale/summer",
        weight: 1,
      },
    ],
  };

  it("saves and retrieves a campaign by id", async () => {
    await campaigns.save(summerSale);
    expect(await campaigns.get("camp-1")).toEqual(summerSale);
  });

  it("returns null for a missing campaign", async () => {
    expect(await campaigns.get("missing")).toBeNull();
  });

  it("lists every campaign", async () => {
    await campaigns.save(summerSale);
    await campaigns.save({ ...summerSale, id: "camp-2", name: "Winter Sale" });
    expect(await campaigns.list()).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
    await campaigns.save(summerSale);
    await campaigns.save({ ...summerSale, status: "inactive" });
    const found = await campaigns.get("camp-1");
    expect(found?.status).toBe("inactive");
    expect(await campaigns.list()).toHaveLength(1);
  });

  it("round-trips null targeting fields for an untargeted campaign", async () => {
    const untargeted: Campaign = {
      ...summerSale,
      id: "camp-untargeted",
      targeting: { serviceAreaId: null, pageSlug: null },
    };
    await campaigns.save(untargeted);
    const found = await campaigns.get("camp-untargeted");
    expect(found?.targeting).toEqual({ serviceAreaId: null, pageSlug: null });
  });

  it("round-trips null startsAt/endsAt for a campaign with no active date range", async () => {
    const openEnded: Campaign = { ...summerSale, id: "camp-open-ended", startsAt: null, endsAt: null };
    await campaigns.save(openEnded);
    const found = await campaigns.get("camp-open-ended");
    expect(found?.startsAt).toBeNull();
    expect(found?.endsAt).toBeNull();
  });

  it("round-trips a multi-creative campaign's creatives array, including each creative's own null imageUrl", async () => {
    const multiCreative: Campaign = {
      ...summerSale,
      id: "camp-multi",
      creatives: [
        {
          id: "creative-a",
          headline: "Headline A",
          body: "Body A",
          imageUrl: "https://example.com/a.png",
          linkHref: "/a",
          weight: 2,
        },
        {
          id: "creative-b",
          headline: "Headline B",
          body: "Body B",
          imageUrl: null,
          linkHref: "/b",
          weight: 1,
        },
      ],
    };
    await campaigns.save(multiCreative);
    const found = await campaigns.get("camp-multi");
    expect(found?.creatives).toHaveLength(2);
    expect(found?.creatives).toEqual(multiCreative.creatives);
    expect(found?.creatives[1]?.imageUrl).toBeNull();
  });
});
