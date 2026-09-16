/**
 * Real, table-backed CampaignRepository coverage (see this package's
 * src/advertising.ts) -- @mercatus-liber/advertising's CampaignRepository
 * was in-memory-only across every adapter, including Postgres, until now.
 * Per the file-isolation rule for concurrently-developed adapter-postgres
 * subsystems, this file defines its OWN local fake Postgres Pool double
 * (not the shared test/fake-pool.ts) recognizing exactly the fixed set of
 * SQL statements src/advertising.ts issues -- same style/rationale as
 * test/fake-pool.ts's header comment, scoped to just this table.
 */
import type { Campaign } from "@mercatus-liber/advertising";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCampaignRepository } from "../src/advertising.js";

interface FakeCampaignRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeCampaignRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeAdvertisingPool(): FakePool {
  const campaigns = new Map<string, FakeCampaignRow>();

  return {
    async query<T = FakeCampaignRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
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
        const [id, name, status, startsAt, endsAt, targeting, creatives] = values as [
          string,
          string,
          string,
          string | null,
          string | null,
          string,
          string,
        ];
        campaigns.set(id, {
          id,
          name,
          status,
          starts_at: startsAt,
          ends_at: endsAt,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here.
          targeting: JSON.parse(targeting),
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

  const springSale: Campaign = {
    id: "camp-1",
    name: "Spring Sale",
    status: "active",
    startsAt: "2026-03-01T00:00:00.000Z",
    endsAt: "2026-03-31T23:59:59.000Z",
    targeting: { serviceAreaId: "area-1", pageSlug: "home" },
    creatives: [
      {
        id: "cr-1",
        headline: "Spring is here",
        body: "20% off everything.",
        imageUrl: "https://cdn.example.com/spring.png",
        linkHref: "/sale/spring",
        weight: 3,
      },
      {
        id: "cr-2",
        headline: "Last chance",
        body: "Ends soon.",
        imageUrl: null,
        linkHref: "/sale/spring",
        weight: 1,
      },
    ],
  };

  it("saves and retrieves a campaign by id, round-tripping 2+ creatives with different weights and a null imageUrl", async () => {
    await campaigns.save(springSale);
    const found = await campaigns.get("camp-1");
    expect(found).toEqual(springSale);
    expect(found?.creatives).toHaveLength(2);
    expect(found?.creatives[0].weight).toBe(3);
    expect(found?.creatives[1].weight).toBe(1);
    expect(found?.creatives[1].imageUrl).toBeNull();
  });

  it("returns null for a missing campaign", async () => {
    expect(await campaigns.get("missing")).toBeNull();
  });

  it("round-trips real targeting with both fields set", async () => {
    await campaigns.save(springSale);
    const found = await campaigns.get("camp-1");
    expect(found?.targeting).toEqual({ serviceAreaId: "area-1", pageSlug: "home" });
  });

  it("round-trips untargeted campaigns -- both targeting fields null", async () => {
    const untargeted: Campaign = {
      ...springSale,
      id: "camp-untargeted",
      targeting: { serviceAreaId: null, pageSlug: null },
    };
    await campaigns.save(untargeted);
    const found = await campaigns.get("camp-untargeted");
    expect(found?.targeting).toEqual({ serviceAreaId: null, pageSlug: null });
  });

  it("round-trips a real startsAt/endsAt window", async () => {
    await campaigns.save(springSale);
    const found = await campaigns.get("camp-1");
    expect(found?.startsAt).toBe("2026-03-01T00:00:00.000Z");
    expect(found?.endsAt).toBe("2026-03-31T23:59:59.000Z");
  });

  it("round-trips both startsAt and endsAt as null, not undefined", async () => {
    const alwaysOn: Campaign = { ...springSale, id: "camp-always-on", startsAt: null, endsAt: null };
    await campaigns.save(alwaysOn);
    const found = await campaigns.get("camp-always-on");
    expect(found?.startsAt).toBeNull();
    expect(found?.endsAt).toBeNull();
  });

  it("lists every campaign", async () => {
    await campaigns.save(springSale);
    await campaigns.save({ ...springSale, id: "camp-2", name: "Summer Sale" });
    const found = await campaigns.list();
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.id).sort()).toEqual(["camp-1", "camp-2"]);
  });

  it("returns an empty array when no campaigns exist", async () => {
    expect(await campaigns.list()).toEqual([]);
  });

  it("updates an existing campaign via resave (status active -> inactive)", async () => {
    await campaigns.save(springSale);
    await campaigns.save({ ...springSale, status: "inactive" });
    const found = await campaigns.get("camp-1");
    expect(found?.status).toBe("inactive");
    expect(await campaigns.list()).toHaveLength(1);
  });

  it("updates an existing campaign via resave, adding a creative (ON CONFLICT DO UPDATE)", async () => {
    await campaigns.save(springSale);
    const withNewCreative = {
      ...springSale,
      creatives: [
        ...springSale.creatives,
        {
          id: "cr-3",
          headline: "One more thing",
          body: "New creative added.",
          imageUrl: null,
          linkHref: "/sale/spring/new",
          weight: 2,
        },
      ],
    };
    await campaigns.save(withNewCreative);
    const found = await campaigns.get("camp-1");
    expect(found?.creatives).toHaveLength(3);
    expect(found?.creatives[2].id).toBe("cr-3");
    expect(await campaigns.list()).toHaveLength(1);
  });
});
