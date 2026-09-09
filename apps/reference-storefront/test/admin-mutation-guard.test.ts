/**
 * admin-auth-03: proves requireAdminPermission (lib/actions.ts) actually
 * gates admin mutation actions by role, using an injectable mock
 * AdminAuthAdapter (never a live Clerk account) -- see
 * admin-auth-03-route-and-mutation-gating.yaml's acceptance criteria. Covers
 * 3 of the 12 guarded actions, one per domain the story calls out by name:
 * promotions (deactivatePromotionAction), bundles (deactivateBundleAction),
 * advertising (deactivateCampaignAction). All three are deliberately picked
 * because they never call next/navigation's redirect() on success -- only
 * revalidatePath(), which (like every Next.js "use server" cache API) throws
 * outside a real request context, so it's mocked to a no-op below, same
 * general "no real Next.js request machinery in a vitest run" posture as
 * every other test in this suite.
 *
 * lib/services.ts's getServicesForDemo() is mocked wholesale so each test can swap
 * in whatever AdminSession (or null) it wants without needing a real Clerk
 * account or the dev-default adapter's cookie machinery -- the promotions/
 * bundles/advertising services underneath are the real, in-memory-backed
 * service implementations, so a "succeeds normally" assertion here proves
 * the actual mutation happened, not just that no error was thrown.
 *
 * cms-crud-01: also covers createCmsPageAction's own requireAdminPermission
 * guard (one of the 4 new CMS admin actions), same "real in-memory-backed
 * CmsService, mocked adminAuth only" shape as the three domains above. Only
 * the viewer-rejection path is exercised here (not a "succeeds normally"
 * counterpart) because createCmsPageAction calls next/navigation's
 * redirect() on success, which -- unlike revalidatePath() -- this suite
 * does not mock, so a real create isn't asserted here; the create/update/
 * publish golden paths are instead verified via the dev-server manual check
 * this story's acceptance criteria call for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { createAdvertisingService, createInMemoryCampaignRepository } from "@mercatus-liber/advertising";
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createComponentRegistry, createCmsService, createInMemoryCmsAdapter } from "@mercatus-liber/cms";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryPromotionRepository, createPromotionsService } from "@mercatus-liber/promotions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentSession: AdminSession | null = null;

const promotions = createPromotionsService({ repository: createInMemoryPromotionRepository(), events: createInMemoryEventBus() });
const bundles = createBundlesService({
  repository: createInMemoryBundleRepository(),
  skuLookup: { getSku: async (id) => ({ id, price: { amount: 100, currency: "USD" } }) },
});
const advertising = createAdvertisingService({ repository: createInMemoryCampaignRepository() });
const cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ adminAuth: mockAdminAuth, promotions, bundles, advertising, cms })),
}));

const { createCmsPageAction, deactivateBundleAction, deactivateCampaignAction, deactivatePromotionAction } = await import(
  "../lib/actions.js"
);

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

describe("admin mutation guard (admin-auth-03)", () => {
  beforeEach(() => {
    currentSession = null;
  });

  describe("deactivatePromotionAction (promotions)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      const promotion = await promotions.createPromotion({
        code: "GUARD-TEST",
        kind: "percentage",
        scope: "cart",
        value: 10,
        currency: "USD",
        targetSkuIds: [],
        minCartAmount: null,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      });
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", promotion.id);
      await expect(deactivatePromotionAction(formData)).rejects.toThrow(/not authorized/i);

      expect((await promotions.getPromotion(promotion.id))?.status).toBe("active");
    });

    it("succeeds for an admin-role session", async () => {
      const promotion = await promotions.createPromotion({
        code: "GUARD-TEST-ADMIN",
        kind: "percentage",
        scope: "cart",
        value: 10,
        currency: "USD",
        targetSkuIds: [],
        minCartAmount: null,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      });
      currentSession = sessionFor("admin");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", promotion.id);
      await deactivatePromotionAction(formData);

      expect((await promotions.getPromotion(promotion.id))?.status).toBe("inactive");
    });

    it("succeeds for an owner-role session", async () => {
      const promotion = await promotions.createPromotion({
        code: "GUARD-TEST-OWNER",
        kind: "percentage",
        scope: "cart",
        value: 10,
        currency: "USD",
        targetSkuIds: [],
        minCartAmount: null,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      });
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", promotion.id);
      await deactivatePromotionAction(formData);

      expect((await promotions.getPromotion(promotion.id))?.status).toBe("inactive");
    });

    it("rejects when there is no session at all", async () => {
      const promotion = await promotions.createPromotion({
        code: "GUARD-TEST-NULL",
        kind: "percentage",
        scope: "cart",
        value: 10,
        currency: "USD",
        targetSkuIds: [],
        minCartAmount: null,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
      });
      currentSession = null;

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", promotion.id);
      await expect(deactivatePromotionAction(formData)).rejects.toThrow(/not authorized/i);

      expect((await promotions.getPromotion(promotion.id))?.status).toBe("active");
    });
  });

  describe("deactivateBundleAction (bundles)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      const bundle = await bundles.createBundle({ productId: "prod-1", title: "Guard Test Bundle", tiers: [{ id: "t1", label: "Only", skuIds: ["sku-1"] }] });
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", bundle.id);
      await expect(deactivateBundleAction(formData)).rejects.toThrow(/not authorized/i);

      expect((await bundles.getBundle(bundle.id))?.status).toBe("active");
    });

    it("succeeds for an admin-role session", async () => {
      const bundle = await bundles.createBundle({ productId: "prod-2", title: "Guard Test Bundle Admin", tiers: [{ id: "t1", label: "Only", skuIds: ["sku-1"] }] });
      currentSession = sessionFor("admin");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", bundle.id);
      await deactivateBundleAction(formData);

      expect((await bundles.getBundle(bundle.id))?.status).toBe("inactive");
    });

    it("succeeds for an owner-role session", async () => {
      const bundle = await bundles.createBundle({ productId: "prod-3", title: "Guard Test Bundle Owner", tiers: [{ id: "t1", label: "Only", skuIds: ["sku-1"] }] });
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", bundle.id);
      await deactivateBundleAction(formData);

      expect((await bundles.getBundle(bundle.id))?.status).toBe("inactive");
    });
  });

  describe("deactivateCampaignAction (advertising)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      const campaign = await advertising.createCampaign({
        name: "Guard Test Campaign",
        startsAt: null,
        endsAt: null,
        targeting: { serviceAreaId: null, pageSlug: null },
        creatives: [{ id: "c1", headline: "Hi", body: "Body", imageUrl: null, linkHref: "/x" }],
      });
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", campaign.id);
      await expect(deactivateCampaignAction(formData)).rejects.toThrow(/not authorized/i);

      expect((await advertising.getCampaign(campaign.id))?.status).toBe("active");
    });

    it("succeeds for an admin-role session", async () => {
      const campaign = await advertising.createCampaign({
        name: "Guard Test Campaign Admin",
        startsAt: null,
        endsAt: null,
        targeting: { serviceAreaId: null, pageSlug: null },
        creatives: [{ id: "c1", headline: "Hi", body: "Body", imageUrl: null, linkHref: "/x" }],
      });
      currentSession = sessionFor("admin");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", campaign.id);
      await deactivateCampaignAction(formData);

      expect((await advertising.getCampaign(campaign.id))?.status).toBe("inactive");
    });

    it("succeeds for an owner-role session", async () => {
      const campaign = await advertising.createCampaign({
        name: "Guard Test Campaign Owner",
        startsAt: null,
        endsAt: null,
        targeting: { serviceAreaId: null, pageSlug: null },
        creatives: [{ id: "c1", headline: "Hi", body: "Body", imageUrl: null, linkHref: "/x" }],
      });
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("id", campaign.id);
      await deactivateCampaignAction(formData);

      expect((await advertising.getCampaign(campaign.id))?.status).toBe("inactive");
    });
  });

  describe("createCmsPageAction (cms)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "category");
      formData.set("slug", "guard-test-page");
      formData.set("title", "Guard Test Page");
      await expect(createCmsPageAction(formData)).rejects.toThrow(/not authorized/i);

      expect(await cms.getPageBySlug("guard-test-page")).toBeNull();
    });

    it("rejects when there is no session at all", async () => {
      currentSession = null;

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "category");
      formData.set("slug", "guard-test-page-null");
      formData.set("title", "Guard Test Page Null");
      await expect(createCmsPageAction(formData)).rejects.toThrow(/not authorized/i);

      expect(await cms.getPageBySlug("guard-test-page-null")).toBeNull();
    });
  });
});
