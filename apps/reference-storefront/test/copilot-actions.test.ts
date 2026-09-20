/**
 * scc-07: covers lib/copilot-actions.ts's applyCopilotOptionAction -- the
 * Server Action CopilotChat.tsx invokes directly (not via a <form>) when an
 * admin clicks "Apply this option" on a rendered candidate card. Same
 * "mock lib/services.js's getServicesForDemo wholesale, real in-memory
 * CmsService/ThemingService underneath, mock next/cache's revalidatePath"
 * shape as test/admin-mutation-guard.test.ts, proving this new call site
 * genuinely enforces the same "mutate" permission gate every other admin
 * mutation action already does -- not a new, weaker mechanism.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthAdapter, AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter, type CmsService } from "@mercatus-liber/cms";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentSession: AdminSession | null = null;
let cms: CmsService;
let theming: ThemingService;

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
  getServicesForDemo: vi.fn(async () => ({ cms, theming, adminAuth: mockAdminAuth })),
}));

const { applyCopilotOptionAction } = await import("../lib/copilot-actions.js");
const { revalidatePath } = await import("next/cache");

function sessionFor(role: AdminSession["role"]): AdminSession {
  return { userId: `copilot-action-test-${role}`, email: `${role}@example.com`, role };
}

describe("applyCopilotOptionAction (scc-07)", () => {
  beforeEach(async () => {
    currentSession = null;
    vi.mocked(revalidatePath).mockClear();
    cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });
    theming = createThemingService();
    await cms.createPage({
      pageType: "home",
      slug: "home",
      title: "Home",
      sections: [{ componentType: "hero-banner", config: { headline: "Welcome", subheadline: "Shop now" } }],
    });
  });

  it("rejects an unknown demo slug before touching any service", async () => {
    await expect(
      applyCopilotOptionAction({
        demoSlug: "not-a-real-demo",
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "nope" },
      }),
    ).rejects.toThrow(/unknown demo slug/i);
  });

  it("rejects a viewer-role session -- the UI must not let a viewer reach this action, and this proves the backend genuinely blocks it too", async () => {
    currentSession = sessionFor("viewer");

    await expect(
      applyCopilotOptionAction({
        demoSlug: "print-shop",
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Should not land" },
      }),
    ).rejects.toThrow(/not authorized/i);

    expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Welcome");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when there is no session at all", async () => {
    currentSession = null;

    await expect(
      applyCopilotOptionAction({
        demoSlug: "print-shop",
        shape: "swap_hero_copy",
        pageType: "home",
        slug: "home",
        chosen: { headline: "Should not land" },
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("succeeds for an admin-role session, genuinely writing through CmsService and revalidating the content-layout dashboard", async () => {
    currentSession = sessionFor("admin");

    await applyCopilotOptionAction({
      demoSlug: "print-shop",
      shape: "swap_hero_copy",
      pageType: "home",
      slug: "home",
      chosen: { headline: "Cozy autumn picks", subheadline: "Limited time" },
    });

    const page = await cms.getPageBySlug("home");
    expect(page?.sections[0]?.config).toEqual({ headline: "Cozy autumn picks", subheadline: "Limited time" });
    expect(revalidatePath).toHaveBeenCalledWith("/demo/print-shop/admin/content-layout");
  });

  it("succeeds for an owner-role session", async () => {
    currentSession = sessionFor("owner");

    await applyCopilotOptionAction({
      demoSlug: "print-shop",
      shape: "swap_hero_copy",
      pageType: "home",
      slug: "home",
      chosen: { headline: "Harvest season deals" },
    });

    expect((await cms.getPageBySlug("home"))?.sections[0]?.config.headline).toBe("Harvest season deals");
  });
});
