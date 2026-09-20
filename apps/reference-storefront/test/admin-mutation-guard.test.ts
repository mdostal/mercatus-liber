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
 *
 * fulfillment-02: also covers markFulfillmentLineShippedAction's own
 * requireAdminPermission guard, same "real, in-memory-backed
 * FulfillmentService, mocked adminAuth only" shape as every domain above.
 * This is also this story's live-verification vehicle for the viewer-role
 * rejection acceptance criterion specifically: @mercatus-liber/admin-auth's
 * createDefaultAdminAuthAdapter (packages/admin-auth/src/default-adapter.ts)
 * is hardcoded to always resolve a valid dev session to role "owner"
 * (`DEV_OWNER_ROLE`) -- confirmed by reading that file directly, not
 * assumed -- so there is no real cookie/session a live dev server run could
 * ever present as role "viewer" through that adapter's actual, unmodified
 * code. Injecting a real AdminSession with role "viewer" directly (exactly
 * this suite's own established mechanism for every other action above) is
 * this repo's real, precedented way to prove the guard rejects that role --
 * the same mechanism admin-auth-03-route-and-mutation-gating.yaml's own
 * acceptance criteria used ("invoked directly") for the original 12
 * mutation actions. markLineShipped is invoked against a real order that
 * was actually routed and submitted first (via the real, unmocked
 * FulfillmentService.submitOrder), so the "succeeds normally" cases below
 * prove a genuine status transition happened, not just that no error was
 * thrown.
 *
 * scc-04: also covers setPageTemplateAction's own requireAdminPermission
 * guard, same "real, in-memory-backed ThemingService, mocked adminAuth
 * only" shape as every domain above -- a "succeeds normally" assertion
 * reads back theming.getConfiguredDefault(pageType) afterward, proving the
 * real ThemingService.setDefaultTemplate call actually happened, not just
 * that no error was thrown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { createAdvertisingService, createInMemoryCampaignRepository } from "@mercatus-liber/advertising";
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createComponentRegistry, createCmsService, createInMemoryCmsAdapter } from "@mercatus-liber/cms";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createFulfillmentService,
  createInMemoryFulfillmentRoutingRepository,
  createManualFulfillmentAdapter,
  MANUAL_FULFILLMENT_PROVIDER,
} from "@mercatus-liber/fulfillment";
import { createInMemoryPromotionRepository, createPromotionsService } from "@mercatus-liber/promotions";
import { createThemingService } from "@mercatus-liber/theming";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentSession: AdminSession | null = null;

const promotions = createPromotionsService({ repository: createInMemoryPromotionRepository(), events: createInMemoryEventBus() });
const bundles = createBundlesService({
  repository: createInMemoryBundleRepository(),
  skuLookup: { getSku: async (id) => ({ id, price: { amount: 100, currency: "USD" } }) },
});
const advertising = createAdvertisingService({ repository: createInMemoryCampaignRepository() });
const cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
const theming = createThemingService();

/** A minimal, real OrderLookup -- fulfillment reads orders structurally, never imports checkout-orders (see docs/subsystems/22-fulfillment.md). */
const fakeOrders = {
  async getOrder(id: string) {
    return id === "guard-test-order" ? { id, items: [{ skuId: "guard-test-sku", quantity: 1 }] } : null;
  },
};
const fulfillment = createFulfillmentService({
  orders: fakeOrders,
  routing: createInMemoryFulfillmentRoutingRepository(),
  adapters: { [MANUAL_FULFILLMENT_PROVIDER]: createManualFulfillmentAdapter() },
});

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
  getServicesForDemo: vi.fn(async () => ({
    adminAuth: mockAdminAuth,
    promotions,
    bundles,
    advertising,
    cms,
    fulfillment,
    theming,
  })),
}));

const {
  createCmsPageAction,
  deactivateBundleAction,
  deactivateCampaignAction,
  deactivatePromotionAction,
  markFulfillmentLineShippedAction,
  setPageTemplateAction,
} = await import("../lib/actions.js");

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

  describe("markFulfillmentLineShippedAction (fulfillment)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      await fulfillment.submitOrder("guard-test-order");
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("orderId", "guard-test-order");
      formData.set("skuId", "guard-test-sku");
      await expect(markFulfillmentLineShippedAction(formData)).rejects.toThrow(/not authorized/i);

      const [record] = await fulfillment.listForOrder("guard-test-order");
      expect(record?.status).toBe("submitted");
    });

    it("rejects when there is no session at all", async () => {
      currentSession = null;

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("orderId", "guard-test-order");
      formData.set("skuId", "guard-test-sku");
      await expect(markFulfillmentLineShippedAction(formData)).rejects.toThrow(/not authorized/i);

      const [record] = await fulfillment.listForOrder("guard-test-order");
      expect(record?.status).toBe("submitted");
    });

    it("succeeds for an admin-role session, with real tracking info persisted", async () => {
      currentSession = sessionFor("admin");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("orderId", "guard-test-order");
      formData.set("skuId", "guard-test-sku");
      formData.set("trackingNumber", "1Z999AA10123456784");
      formData.set("trackingUrl", "https://example.com/track/1Z999AA10123456784");
      await markFulfillmentLineShippedAction(formData);

      const [record] = await fulfillment.listForOrder("guard-test-order");
      expect(record?.status).toBe("shipped");
      expect(record?.trackingNumber).toBe("1Z999AA10123456784");
      expect(record?.trackingUrl).toBe("https://example.com/track/1Z999AA10123456784");
    });

    it("succeeds for an owner-role session", async () => {
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("orderId", "guard-test-order");
      formData.set("skuId", "guard-test-sku");
      await markFulfillmentLineShippedAction(formData);

      const [record] = await fulfillment.listForOrder("guard-test-order");
      expect(record?.status).toBe("shipped");
    });
  });

  describe("setPageTemplateAction (theming)", () => {
    it("rejects a viewer-role session before mutating", async () => {
      currentSession = sessionFor("viewer");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "home");
      formData.set("templateKey", "home.magazine-grid");
      await expect(setPageTemplateAction(formData)).rejects.toThrow(/not authorized/i);

      expect(theming.getConfiguredDefault("home")).toBeNull();
    });

    it("rejects when there is no session at all", async () => {
      currentSession = null;

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "home");
      formData.set("templateKey", "home.magazine-grid");
      await expect(setPageTemplateAction(formData)).rejects.toThrow(/not authorized/i);

      expect(theming.getConfiguredDefault("home")).toBeNull();
    });

    it("rejects an invalid page type even for an owner session", async () => {
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "marketing");
      formData.set("templateKey", "home.magazine-grid");
      await expect(setPageTemplateAction(formData)).rejects.toThrow(/invalid page type/i);
    });

    it("rejects a template key not registered for that page type", async () => {
      currentSession = sessionFor("owner");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "cart");
      formData.set("templateKey", "pdp.tabbed-detail");
      await expect(setPageTemplateAction(formData)).rejects.toThrow(/invalid template key/i);

      expect(theming.getConfiguredDefault("cart")).toBeNull();
    });

    it("succeeds for an admin-role session, with the real per-page-type default persisted", async () => {
      currentSession = sessionFor("admin");

      const formData = new FormData();
      formData.set("demoSlug", "print-shop");
      formData.set("pageType", "category");
      formData.set("templateKey", "category.magazine-grid");
      await setPageTemplateAction(formData);

      expect(theming.getConfiguredDefault("category")).toBe("category.magazine-grid");
      // Independent of every other page type -- only "category" changed.
      expect(theming.getConfiguredDefault("home")).toBeNull();
    });

    it("succeeds for an owner-role session, and a later call overrides the earlier one", async () => {
      currentSession = sessionFor("owner");

      const first = new FormData();
      first.set("demoSlug", "print-shop");
      first.set("pageType", "pdp");
      first.set("templateKey", "pdp.long-scroll");
      await setPageTemplateAction(first);
      expect(theming.getConfiguredDefault("pdp")).toBe("pdp.long-scroll");

      const second = new FormData();
      second.set("demoSlug", "print-shop");
      second.set("pageType", "pdp");
      second.set("templateKey", "pdp.spec-sheet");
      await setPageTemplateAction(second);
      expect(theming.getConfiguredDefault("pdp")).toBe("pdp.spec-sheet");
    });
  });
});
