import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryCampaignRepository } from "../src/in-memory-repository.js";
import { createAdvertisingService, type AdvertisingService } from "../src/service.js";
import type { CampaignRepository, CreateCampaignInput } from "../src/types.js";

function campaignInput(overrides: Partial<CreateCampaignInput> = {}): CreateCampaignInput {
  return {
    name: "Untargeted always-on campaign",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: null, pageSlug: null },
    creatives: [
      {
        id: "creative-1",
        headline: "Headline",
        body: "Body copy",
        imageUrl: null,
        linkHref: "https://example.com/offer",
      },
    ],
    ...overrides,
  };
}

describe("advertising service", () => {
  let repository: CampaignRepository;
  let advertising: AdvertisingService;

  beforeEach(() => {
    repository = createInMemoryCampaignRepository();
    advertising = createAdvertisingService({ repository });
  });

  describe("CRUD basics", () => {
    it("createCampaign assigns an id, defaults status to active, and defaults an unspecified creative weight to 1", async () => {
      const campaign = await advertising.createCampaign(campaignInput());
      expect(campaign.id).toBeTruthy();
      expect(campaign.status).toBe("active");
      expect(campaign.creatives[0]!.weight).toBe(1);
    });

    it("createCampaign respects an explicit status and explicit creative weight", async () => {
      const campaign = await advertising.createCampaign(
        campaignInput({
          status: "inactive",
          creatives: [
            {
              id: "c1",
              headline: "H",
              body: "B",
              imageUrl: null,
              linkHref: "https://example.com",
              weight: 5,
            },
          ],
        }),
      );
      expect(campaign.status).toBe("inactive");
      expect(campaign.creatives[0]!.weight).toBe(5);
    });

    it("getCampaign returns null for an unknown id", async () => {
      expect(await advertising.getCampaign("missing")).toBeNull();
    });

    it("getCampaign returns the created campaign by id", async () => {
      const created = await advertising.createCampaign(campaignInput());
      expect(await advertising.getCampaign(created.id)).toEqual(created);
    });

    it("listCampaigns returns every created campaign", async () => {
      const a = await advertising.createCampaign(campaignInput({ name: "A" }));
      const b = await advertising.createCampaign(campaignInput({ name: "B" }));
      const listed = await advertising.listCampaigns();
      expect(listed.map((c) => c.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });
  });

  describe("validation (AC7)", () => {
    it("AC7: createCampaign with zero creatives rejects clearly and persists nothing", async () => {
      await expect(advertising.createCampaign(campaignInput({ creatives: [] }))).rejects.toThrow(
        /at least one creative/i,
      );
      expect(await advertising.listCampaigns()).toEqual([]);
    });

    it("createCampaign rejects a creative with an empty linkHref", async () => {
      await expect(
        advertising.createCampaign(
          campaignInput({
            creatives: [{ id: "c1", headline: "H", body: "B", imageUrl: null, linkHref: "" }],
          }),
        ),
      ).rejects.toThrow(/linkHref/i);
      expect(await advertising.listCampaigns()).toEqual([]);
    });

    it("updateCampaign rejects reducing a campaign to zero creatives, leaving the existing campaign unchanged", async () => {
      const created = await advertising.createCampaign(campaignInput());
      await expect(advertising.updateCampaign(created.id, { creatives: [] })).rejects.toThrow(
        /at least one creative/i,
      );
      expect(await advertising.getCampaign(created.id)).toEqual(created);
    });

    it("updateCampaign rejects an empty linkHref on a creative", async () => {
      const created = await advertising.createCampaign(campaignInput());
      await expect(
        advertising.updateCampaign(created.id, {
          creatives: [{ id: "c1", headline: "H", body: "B", imageUrl: null, linkHref: "   " }],
        }),
      ).rejects.toThrow(/linkHref/i);
    });
  });

  describe("updateCampaign (AC8)", () => {
    it("AC8: updateCampaign changes the name while getCampaign reflects it, preserving id and creatives", async () => {
      const created = await advertising.createCampaign(campaignInput({ name: "Original name" }));
      const updated = await advertising.updateCampaign(created.id, { name: "New name" });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("New name");
      expect(updated!.id).toBe(created.id);
      expect(updated!.creatives).toEqual(created.creatives);

      const fetched = await advertising.getCampaign(created.id);
      expect(fetched!.name).toBe("New name");
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.creatives).toEqual(created.creatives);
    });

    it("updateCampaign returns null for an unknown id", async () => {
      expect(await advertising.updateCampaign("missing", { name: "x" })).toBeNull();
    });
  });

  describe("deactivateCampaign (AC9)", () => {
    it("AC9: a deactivated campaign is excluded from getActiveCreativeForSlot but remains visible via listCampaigns/getCampaign", async () => {
      const created = await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: null, pageSlug: "home" } }),
      );

      const beforeResult = await advertising.getActiveCreativeForSlot({ pageSlug: "home" });
      expect(beforeResult).not.toBeNull();
      expect(beforeResult!.campaign.id).toBe(created.id);

      const deactivated = await advertising.deactivateCampaign(created.id);
      expect(deactivated!.status).toBe("inactive");

      const afterResult = await advertising.getActiveCreativeForSlot({ pageSlug: "home" });
      expect(afterResult).toBeNull();

      // Still visible for admin purposes.
      expect(await advertising.getCampaign(created.id)).not.toBeNull();
      const listed = await advertising.listCampaigns();
      expect(listed.map((c) => c.id)).toContain(created.id);
    });

    it("deactivateCampaign returns null for an unknown id", async () => {
      expect(await advertising.deactivateCampaign("missing")).toBeNull();
    });
  });

  describe("getActiveCreativeForSlot -- eligibility (AC1-4, AC6)", () => {
    it("AC1: an untargeted, active, no-date-range campaign with one creative is returned for any pageSlug", async () => {
      const created = await advertising.createCampaign(campaignInput());
      const result = await advertising.getActiveCreativeForSlot({ pageSlug: "anything" });
      expect(result).not.toBeNull();
      expect(result!.campaign.id).toBe(created.id);
      expect(result!.creative.id).toBe(created.creatives[0]!.id);
    });

    it("AC2: a campaign targeted to serviceAreaId 'sa-1' is excluded when the slot requests 'sa-2'", async () => {
      await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: "sa-1", pageSlug: null } }),
      );
      const result = await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-2" });
      expect(result).toBeNull();
    });

    it("AC2b: that same sa-1-targeted campaign IS returned when the slot requests sa-1", async () => {
      const created = await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: "sa-1", pageSlug: null } }),
      );
      const result = await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-1" });
      expect(result!.campaign.id).toBe(created.id);
    });

    it("AC3: a campaign with startsAt in the future is excluded when called with the default now", async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      await advertising.createCampaign(campaignInput({ startsAt: future }));
      const result = await advertising.getActiveCreativeForSlot({});
      expect(result).toBeNull();
    });

    it("AC4: a campaign with endsAt in the past is excluded when called with the default now", async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      await advertising.createCampaign(campaignInput({ endsAt: past }));
      const result = await advertising.getActiveCreativeForSlot({});
      expect(result).toBeNull();
    });

    it("a campaign is included when now falls within an explicit startsAt/endsAt window", async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
      const created = await advertising.createCampaign(campaignInput({ startsAt: past, endsAt: future }));
      const result = await advertising.getActiveCreativeForSlot({});
      expect(result!.campaign.id).toBe(created.id);
    });

    it("an explicit `now` overrides the real clock for date-range eligibility", async () => {
      const startsAt = "2030-01-01T00:00:00.000Z";
      const created = await advertising.createCampaign(campaignInput({ startsAt }));
      const beforeStart = await advertising.getActiveCreativeForSlot({ now: new Date("2029-12-31T00:00:00.000Z") });
      expect(beforeStart).toBeNull();
      const afterStart = await advertising.getActiveCreativeForSlot({ now: new Date("2030-06-01T00:00:00.000Z") });
      expect(afterStart!.campaign.id).toBe(created.id);
    });

    it("a pageSlug-targeted campaign is excluded when the slot requests a different pageSlug", async () => {
      await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: null, pageSlug: "home" } }),
      );
      const result = await advertising.getActiveCreativeForSlot({ pageSlug: "about" });
      expect(result).toBeNull();
    });

    it("a campaign targeting both dimensions requires both to match", async () => {
      const created = await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: "sa-1", pageSlug: "home" } }),
      );
      expect(await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-1", pageSlug: "home" })).not.toBeNull();
      expect(await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-1", pageSlug: "about" })).toBeNull();
      expect(await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-2", pageSlug: "home" })).toBeNull();
      void created;
    });

    it("AC6: returns null (not an error) when no campaign is eligible for the given slot", async () => {
      await advertising.createCampaign(
        campaignInput({ targeting: { serviceAreaId: "sa-1", pageSlug: null } }),
      );
      const result = await advertising.getActiveCreativeForSlot({ serviceAreaId: "sa-2", pageSlug: "nope" });
      expect(result).toBeNull();
    });

    it("returns null (not an error) when there are no campaigns at all", async () => {
      const result = await advertising.getActiveCreativeForSlot({});
      expect(result).toBeNull();
    });
  });

  describe("getActiveCreativeForSlot -- weighted rotation (AC5)", () => {
    it("AC5: an injected random landing in the heavy creative's share (99/100) returns the heavy creative", async () => {
      const created = await advertising.createCampaign(
        campaignInput({
          creatives: [
            { id: "light", headline: "Light", body: "B", imageUrl: null, linkHref: "https://example.com/light", weight: 1 },
            { id: "heavy", headline: "Heavy", body: "B", imageUrl: null, linkHref: "https://example.com/heavy", weight: 99 },
          ],
        }),
      );
      // totalWeight = 100. point = 0.5 * 100 = 50, which lands in the
      // heavy creative's [1, 100) cumulative range, not the light
      // creative's [0, 1) range.
      const result = await advertising.getActiveCreativeForSlot({ random: () => 0.5 });
      expect(result!.campaign.id).toBe(created.id);
      expect(result!.creative.id).toBe("heavy");
    });

    it("AC5: an injected random landing in the light creative's tiny share (1/100) returns the light creative", async () => {
      await advertising.createCampaign(
        campaignInput({
          creatives: [
            { id: "light", headline: "Light", body: "B", imageUrl: null, linkHref: "https://example.com/light", weight: 1 },
            { id: "heavy", headline: "Heavy", body: "B", imageUrl: null, linkHref: "https://example.com/heavy", weight: 99 },
          ],
        }),
      );
      // point = 0.005 * 100 = 0.5, which lands in the light creative's
      // [0, 1) cumulative range.
      const result = await advertising.getActiveCreativeForSlot({ random: () => 0.005 });
      expect(result!.creative.id).toBe("light");
    });

    it("proves weighting is proportional, not uniform: sweeping random across [0,1) yields the heavy creative far more than half the time", async () => {
      await advertising.createCampaign(
        campaignInput({
          creatives: [
            { id: "light", headline: "Light", body: "B", imageUrl: null, linkHref: "https://example.com/light", weight: 1 },
            { id: "heavy", headline: "Heavy", body: "B", imageUrl: null, linkHref: "https://example.com/heavy", weight: 99 },
          ],
        }),
      );
      const samples = 1000;
      let heavyCount = 0;
      for (let i = 0; i < samples; i++) {
        // Deterministic sweep across [0, 1), not Math.random() --
        // reproducible and still exercises the full cumulative range.
        const point = i / samples;
        const result = await advertising.getActiveCreativeForSlot({ random: () => point });
        if (result!.creative.id === "heavy") heavyCount++;
      }
      // With weights 1/99, exactly 990 of 1000 evenly spaced points should
      // select "heavy" -- a uniform (unweighted) pick would produce ~500.
      expect(heavyCount).toBe(990);
    });

    it("flattens creatives across multiple eligible campaigns before the weighted pick, and defaults Math.random when random is omitted", async () => {
      const a = await advertising.createCampaign(
        campaignInput({ name: "A", creatives: [{ id: "a1", headline: "A1", body: "B", imageUrl: null, linkHref: "https://example.com/a1" }] }),
      );
      const b = await advertising.createCampaign(
        campaignInput({ name: "B", creatives: [{ id: "b1", headline: "B1", body: "B", imageUrl: null, linkHref: "https://example.com/b1" }] }),
      );
      const result = await advertising.getActiveCreativeForSlot({});
      expect(result).not.toBeNull();
      expect([a.id, b.id]).toContain(result!.campaign.id);
    });

    it("treats a zero or negative creative weight as 1 in the selection math rather than excluding it", async () => {
      const created = await advertising.createCampaign(
        campaignInput({
          creatives: [
            { id: "zero", headline: "Zero", body: "B", imageUrl: null, linkHref: "https://example.com/zero", weight: 0 },
            { id: "negative", headline: "Negative", body: "B", imageUrl: null, linkHref: "https://example.com/neg", weight: -5 },
          ],
        }),
      );
      // Both effectively weight 1 -> totalWeight 2. point = 0.5 * 2 = 1.0,
      // which lands exactly on the "zero" entry's cumulative boundary and
      // so falls into "negative"'s [1, 2) range.
      const result = await advertising.getActiveCreativeForSlot({ random: () => 0.5 });
      expect(result!.campaign.id).toBe(created.id);
      expect(result!.creative.id).toBe("negative");
    });
  });

  /**
   * commerce-gap-audit-3: a real, live finding -- confirmed against
   * commerce.mdostal.com before this fix, print-shop's own untargeted
   * "Print Shop Sale" campaign and Northline's own untargeted "Northline
   * Fall Install Special" campaign both live in the same shared Postgres
   * `campaigns` table (print-shop and Northline Home Tech both resolve to
   * the same DATABASE_URL, per lib/services.ts's resolveDemoPersistenceEnv)
   * -- getActiveCreativeForSlot's repository.list() carried no demo filter
   * at all, so either demo's untargeted campaign was eligible on the OTHER
   * demo's ad slots too. Same bug class/fix shape as
   * @mercatus-liber/marketing-catalog's Category.demoSlug test (epic 61)
   * and @mercatus-liber/cms's Page.demoSlug test (epic 60).
   */
  describe("demo scoping", () => {
    it("listCampaigns/getActiveCreativeForSlot scope by demoSlug -- two different demos' campaigns never bleed into each other's results", async () => {
      const printShop = await advertising.createCampaign(
        campaignInput({
          name: "Print Shop Sale",
          demoSlug: "print-shop",
          creatives: [{ id: "print-shop-1", headline: "Print Shop", body: "B", imageUrl: null, linkHref: "/demo/print-shop" }],
        }),
      );
      const northline = await advertising.createCampaign(
        campaignInput({
          name: "Northline Fall Install Special",
          demoSlug: "northline",
          creatives: [{ id: "northline-1", headline: "Northline", body: "B", imageUrl: null, linkHref: "/demo/northline" }],
        }),
      );

      const printShopCampaigns = await advertising.listCampaigns({ demoSlug: "print-shop" });
      expect(printShopCampaigns.map((c) => c.id)).toEqual([printShop.id]);

      const northlineCampaigns = await advertising.listCampaigns({ demoSlug: "northline" });
      expect(northlineCampaigns.map((c) => c.id)).toEqual([northline.id]);

      // The actual live bug: an untargeted campaign rendering on the wrong
      // demo's ad slot. Deterministic random() so only one entry can win.
      const printShopSlot = await advertising.getActiveCreativeForSlot({ demoSlug: "print-shop", random: () => 0 });
      expect(printShopSlot!.campaign.id).toBe(printShop.id);

      const northlineSlot = await advertising.getActiveCreativeForSlot({ demoSlug: "northline", random: () => 0 });
      expect(northlineSlot!.campaign.id).toBe(northline.id);

      // Unscoped calls (no demoSlug filter) legitimately still see
      // everything -- backward compatible, matching the precedent's own
      // "unscoped call still returns everything" guarantee.
      const everything = await advertising.listCampaigns();
      expect(everything.map((c) => c.id).sort()).toEqual([printShop.id, northline.id].sort());
    });
  });
});
