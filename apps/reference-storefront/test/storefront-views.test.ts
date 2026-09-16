/**
 * storefront-views-and-multi-catalog epic: this app's own APP-LAYER wiring
 * for @mercatus-liber/storefront-views had zero coverage in this suite --
 * the package itself is thoroughly unit-tested at
 * packages/storefront-views/test/storefront-views.test.ts (isViewLive,
 * getActiveDefaultOverride, publishView's duplicate-slug guard, etc, all
 * proven there against synthetic fixtures), but nothing here proved this
 * app's own real call sites actually wire that package together correctly:
 * app/demo/[demoSlug]/site/[viewSlug]/page.tsx's own getViewBySlug ->
 * isViewLive -> buildViewSections sequence, app/demo/[demoSlug]/page.tsx's
 * own getActiveDefaultOverride branch, lib/storefront-view-sections.ts's
 * buildViewSections (category/product resolution + themeKey fallback,
 * itself never unit-tested anywhere), and lib/actions.ts's admin CRUD
 * actions layered on top of publishView's guard.
 *
 * Rendering choice: this suite never renders the actual React Server
 * Components for either route (same posture as test/admin-views.test.ts's
 * own doc comment -- "without needing to render the actual React Server
 * Components"). Instead, resolveSiteRoute/resolveHomeContent below
 * literally reproduce the two pages' own real branching glue code
 * (getViewBySlug/getActiveDefaultOverride -> isViewLive gate ->
 * buildViewSections vs. cms.getPageBySlug fallback) verbatim, calling the
 * exact same real, unmodified functions those pages import
 * (isViewLive/getActiveDefaultOverride from @mercatus-liber/storefront-views,
 * buildViewSections from lib/storefront-view-sections.ts) -- so what's
 * under test is the real wiring, not a reimplementation of it.
 *
 * Seed-data choice for the "real seeded views" sanity check (#5 below):
 * driving the full seed pipeline (seedCatalog/seedNorthlineDemo/
 * seedBroadleafDemo, each already accepting an optional StorefrontViewsService
 * param) turned out to be exactly as practical as hand-rolled fixtures --
 * every other *-demo.test.ts file in this suite already does this -- and it
 * proves something fixtures can't: that the 3 real seed functions this repo
 * ships (lib/seed.ts, lib/seed-northline.ts, lib/seed-broadleaf.ts) still
 * produce sane, non-empty categoryIds resolving to real categories, not just
 * that the service layer *can* store arbitrary ones.
 */
import type { ComponentInstance } from "@mercatus-liber/cms";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import { getThemeBundle, THEME_BUNDLES, type ThemeBundle } from "@mercatus-liber/theming";
import {
  createInMemoryStorefrontViewRepository,
  createStorefrontViewsService,
  DuplicateStorefrontViewSlugError,
  isViewLive,
  type NewStorefrontViewInput,
  type StorefrontView,
  type StorefrontViewsService,
} from "@mercatus-liber/storefront-views";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildViewSections } from "../lib/storefront-view-sections.js";
import { seedCatalog } from "../lib/seed.js";
import { seedNorthlineDemo } from "../lib/seed-northline.js";
import { seedBroadleafDemo } from "../lib/seed-broadleaf.js";
import { buildTestCatalogServices } from "./helpers.js";

// vi.mock calls are hoisted by vitest to the top of the file regardless of
// where they're written, but the module they gate (lib/actions.js, imported
// dynamically below) must only be imported AFTER these run -- same "mock
// next's request-only APIs, then dynamic-import the real, unmocked
// in-memory-backed services underneath" shape as
// test/admin-mutation-guard.test.ts, extended here to also mock
// next/navigation's redirect (createStorefrontViewAction calls it on
// success; publish/archive never do, same as that file's own actions).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

let currentAdminSession: AdminSession | null = null;
const crudStorefrontViews = createStorefrontViewsService({ repository: createInMemoryStorefrontViewRepository() });

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentAdminSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ adminAuth: mockAdminAuth, storefrontViews: crudStorefrontViews })),
}));

const { createStorefrontViewAction, publishStorefrontViewAction, archiveStorefrontViewAction } = await import("../lib/actions.js");

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

const CLASSIC = THEME_BUNDLES[0]!;

function baseViewInput(categoryIds: string[], overrides: Partial<NewStorefrontViewInput> = {}): NewStorefrontViewInput {
  return {
    demoSlug: "print-shop",
    slug: "corp-view",
    name: "Corp View",
    heroHeadline: "Branded swag for your whole team",
    heroSubheadline: "Bulk-order pricing on embroidered apparel and drinkware.",
    categoryIds,
    ...overrides,
  };
}

/** Same fixture shape as packages/storefront-views/test/storefront-views.test.ts's own liveCandidate -- used only for the themeKey-resolution tests, which need no real repository/service round-trip. */
function fixtureView(overrides: Partial<StorefrontView> = {}): StorefrontView {
  return {
    id: "v1",
    demoSlug: "print-shop",
    slug: "s",
    name: "n",
    heroHeadline: "h",
    heroSubheadline: "hs",
    categoryIds: [],
    themeKey: null,
    isDefaultOverride: false,
    startsAt: null,
    endsAt: null,
    status: "active",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Reproduces app/demo/[demoSlug]/site/[viewSlug]/page.tsx's own real
 * `const view = await storefrontViews.getViewBySlug(...); if (!view ||
 * !isViewLive(view)) notFound();` gate, then that same page's
 * `buildViewSections({ marketingCatalog }, view, baseTheme)` call -- byte
 * for byte, just with an explicit `now` (the real page implicitly uses
 * `new Date()`) so window-boundary assertions are deterministic. Returns
 * null for exactly the cases the real page's notFound() covers.
 */
async function resolveSiteRoute(
  storefrontViews: StorefrontViewsService,
  marketingCatalog: MarketingCatalogService,
  demoSlug: string,
  viewSlug: string,
  baseTheme: ThemeBundle,
  now: Date,
) {
  const view = await storefrontViews.getViewBySlug(demoSlug, viewSlug);
  if (!view || !isViewLive(view, now)) return null;
  return buildViewSections({ marketingCatalog }, view, baseTheme);
}

/**
 * Reproduces app/demo/[demoSlug]/page.tsx's own real
 * `getActiveDefaultOverride` branch -- override wins via buildViewSections
 * when live, otherwise falls back to `cms.getPageBySlug("home-<demoSlug>")`
 * -- byte for byte, with an explicit `now` for the same determinism reason
 * as resolveSiteRoute above.
 */
async function resolveHomeContent(
  cms: { getPageBySlug(slug: string): Promise<{ sections: ComponentInstance[] } | null> },
  marketingCatalog: MarketingCatalogService,
  storefrontViews: StorefrontViewsService,
  demoSlug: string,
  baseTheme: ThemeBundle,
  now: Date,
): Promise<{ sections: ComponentInstance[]; theme: ThemeBundle; source: "override" | "normal" }> {
  const activeOverride = await storefrontViews.getActiveDefaultOverride(demoSlug, now);
  if (activeOverride) {
    const { sections, theme } = await buildViewSections({ marketingCatalog }, activeOverride, baseTheme);
    return { sections, theme, source: "override" };
  }
  const home = await cms.getPageBySlug(`home-${demoSlug}`);
  return { sections: home?.sections ?? [], theme: baseTheme, source: "normal" };
}

/** Shared per-test wiring for sections 1-2: a real seeded print-shop catalog plus a fresh, empty StorefrontViewsService. */
async function setup() {
  const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
  await seedCatalog(catalog, marketingCatalog, cms, inventory);
  const storefrontViews = createStorefrontViewsService({ repository: createInMemoryStorefrontViewRepository() });
  const embroidery = await marketingCatalog.getCategoryBySlug("embroidery");
  const coasters = await marketingCatalog.getCategoryBySlug("custom-coasters");
  const categoryIds = [embroidery!.id, coasters!.id];
  return { catalog, marketingCatalog, cms, inventory, storefrontViews, categoryIds, embroidery: embroidery!, coasters: coasters! };
}

describe("a view's own /site/<slug> route (site/[viewSlug]/page.tsx wiring)", () => {
  it("a published, no-window view renders: correct hero copy, correct curated categories/products via buildViewSections", async () => {
    const { marketingCatalog, storefrontViews, categoryIds, embroidery, coasters } = await setup();
    const created = await storefrontViews.createView(baseViewInput(categoryIds, { slug: "corp-view" }));
    await storefrontViews.publishView(created.id);

    const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "corp-view", CLASSIC, new Date("2026-06-01T00:00:00Z"));
    expect(result).not.toBeNull();

    expect(result!.sections[0]).toEqual({
      componentType: "hero-banner",
      config: { headline: created.heroHeadline, subheadline: created.heroSubheadline },
    });

    const categorySpot = result!.sections.find((s) => s.componentType === "category-spot");
    expect(categorySpot?.config).toEqual({ categorySlugs: [embroidery.slug, coasters.slug] });

    // Ground truth product ids computed independently from the real
    // MarketingCatalogService, not a second hand-typed copy.
    const idsA = await marketingCatalog.listProductIdsInCategory(embroidery.id);
    const idsB = await marketingCatalog.listProductIdsInCategory(coasters.id);
    const expectedIds = Array.from(new Set([...idsA, ...idsB])).slice(0, 12);
    expect(expectedIds.length).toBeGreaterThan(0);
    const productGrid = result!.sections.find((s) => s.componentType === "product-grid");
    expect(productGrid?.config).toEqual({ productIds: expectedIds });
  });

  it("a draft view 404s at its own URL", async () => {
    const { marketingCatalog, storefrontViews, categoryIds } = await setup();
    await storefrontViews.createView(baseViewInput(categoryIds, { slug: "draft-view" }));
    const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "draft-view", CLASSIC, new Date());
    expect(result).toBeNull();
  });

  it("an archived view 404s at its own URL", async () => {
    const { marketingCatalog, storefrontViews, categoryIds } = await setup();
    const created = await storefrontViews.createView(baseViewInput(categoryIds, { slug: "archived-view" }));
    await storefrontViews.publishView(created.id);
    await storefrontViews.archiveView(created.id);
    const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "archived-view", CLASSIC, new Date());
    expect(result).toBeNull();
  });

  it(
    "a published view with a FUTURE startsAt 404s at its own URL -- deliberate, not a bug: isViewLive gates this route exactly the same as the home-page takeover, so a campaign that hasn't opened yet has no live URL anywhere, including its own permanent /site/<slug> (confirmed by that route file's own doc comments)",
    async () => {
      const { marketingCatalog, storefrontViews, categoryIds } = await setup();
      const created = await storefrontViews.createView(
        baseViewInput(categoryIds, { slug: "future-view", startsAt: "2026-12-25T00:00:00Z" }),
      );
      await storefrontViews.publishView(created.id);

      const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "future-view", CLASSIC, new Date("2026-06-01T00:00:00Z"));
      expect(result).toBeNull();
    },
  );

  it("a published view with an ENDED endsAt 404s at its own URL too (end is exclusive, same as isViewLive's own semantics)", async () => {
    const { marketingCatalog, storefrontViews, categoryIds } = await setup();
    const created = await storefrontViews.createView(
      baseViewInput(categoryIds, { slug: "ended-view", endsAt: "2026-01-01T00:00:00Z" }),
    );
    await storefrontViews.publishView(created.id);

    const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "ended-view", CLASSIC, new Date("2026-06-01T00:00:00Z"));
    expect(result).toBeNull();
  });

  it("an unknown slug 404s too, same code path as any not-live view", async () => {
    const { marketingCatalog, storefrontViews } = await setup();
    const result = await resolveSiteRoute(storefrontViews, marketingCatalog, "print-shop", "does-not-exist", CLASSIC, new Date());
    expect(result).toBeNull();
  });
});

describe("home-page default-override takeover (app/demo/[demoSlug]/page.tsx wiring)", () => {
  it("with no isDefaultOverride view live, the store's normal CMS home page renders unaffected", async () => {
    const { cms, marketingCatalog, storefrontViews } = await setup();
    const result = await resolveHomeContent(cms, marketingCatalog, storefrontViews, "print-shop", CLASSIC, new Date());
    expect(result.source).toBe("normal");
    const home = await cms.getPageBySlug("home-print-shop");
    expect(result.sections).toEqual(home!.sections);
  });

  it("with exactly one isDefaultOverride:true view currently live, the home page renders THAT view's curated content instead, via the same buildViewSections path", async () => {
    const { cms, marketingCatalog, storefrontViews, categoryIds } = await setup();
    const created = await storefrontViews.createView(
      baseViewInput(categoryIds, {
        slug: "takeover",
        isDefaultOverride: true,
        heroHeadline: "Corporate & Bulk Orders Takeover",
      }),
    );
    await storefrontViews.publishView(created.id);

    const now = new Date("2026-06-01T00:00:00Z");
    const result = await resolveHomeContent(cms, marketingCatalog, storefrontViews, "print-shop", CLASSIC, now);
    expect(result.source).toBe("override");
    expect(result.sections[0]).toEqual({
      componentType: "hero-banner",
      config: { headline: "Corporate & Bulk Orders Takeover", subheadline: created.heroSubheadline },
    });

    // Not just "some hero" -- genuinely the view's own copy, not the store's normal home copy.
    const home = await cms.getPageBySlug("home-print-shop");
    const normalHeadline = (home!.sections[0]!.config as { headline: string }).headline;
    expect(normalHeadline).not.toBe("Corporate & Bulk Orders Takeover");
  });

  it("once the override's window ends, the home page automatically reverts to normal content on the next request -- no manual step, same view object, only `now` advances", async () => {
    const { cms, marketingCatalog, storefrontViews, categoryIds } = await setup();
    const created = await storefrontViews.createView(
      baseViewInput(categoryIds, {
        slug: "seasonal-takeover",
        isDefaultOverride: true,
        heroHeadline: "Seasonal Takeover",
        startsAt: "2026-10-01T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z",
      }),
    );
    await storefrontViews.publishView(created.id);

    const before = await resolveHomeContent(cms, marketingCatalog, storefrontViews, "print-shop", CLASSIC, new Date("2026-09-15T00:00:00Z"));
    expect(before.source).toBe("normal");

    const inside = await resolveHomeContent(cms, marketingCatalog, storefrontViews, "print-shop", CLASSIC, new Date("2026-10-15T00:00:00Z"));
    expect(inside.source).toBe("override");

    // Window ended -- same createView/publishView call as above, nothing
    // re-saved or archived -- yet the very next "request" (a fresh `now`)
    // reverts on its own.
    const after = await resolveHomeContent(cms, marketingCatalog, storefrontViews, "print-shop", CLASSIC, new Date("2026-11-15T00:00:00Z"));
    expect(after.source).toBe("normal");
    const home = await cms.getPageBySlug("home-print-shop");
    expect(after.sections).toEqual(home!.sections);
  });
});

describe("themeKey override resolution (lib/storefront-view-sections.ts's buildViewSections)", () => {
  it("a real registered themeKey renders under that theme instead of the store's active theme", async () => {
    const { marketingCatalog } = buildTestCatalogServices();
    const view = fixtureView({ themeKey: "datasheet" });

    const { theme } = await buildViewSections({ marketingCatalog }, view, CLASSIC);
    expect(theme).toEqual(getThemeBundle("datasheet"));
    expect(theme).not.toEqual(CLASSIC);
  });

  it("themeKey: null inherits the store's active theme unchanged", async () => {
    const { marketingCatalog } = buildTestCatalogServices();
    const view = fixtureView({ themeKey: null });

    const { theme } = await buildViewSections({ marketingCatalog }, view, CLASSIC);
    expect(theme).toEqual(CLASSIC);
  });

  it("an unknown/unregistered themeKey string also falls back to the store's active theme, per buildViewSections' own documented `getThemeBundle(key) ?? baseTheme` behavior", async () => {
    const { marketingCatalog } = buildTestCatalogServices();
    const view = fixtureView({ themeKey: "not-a-real-theme-xyz" });
    expect(getThemeBundle("not-a-real-theme-xyz")).toBeUndefined();

    const { theme } = await buildViewSections({ marketingCatalog }, view, CLASSIC);
    expect(theme).toEqual(CLASSIC);
  });
});

describe("admin storefront-views CRUD actions + publishView's duplicate-slug guard (lib/actions.ts)", () => {
  function createFormData(fields: Record<string, string>): FormData {
    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    return formData;
  }

  beforeEach(() => {
    currentAdminSession = null;
  });

  it("rejects a viewer-role session before creating a view", async () => {
    currentAdminSession = sessionFor("viewer");
    const formData = createFormData({ slug: "guard-reject", name: "Guard Reject", heroHeadline: "Headline" });
    await expect(createStorefrontViewAction(formData)).rejects.toThrow(/not authorized/i);
    expect(await crudStorefrontViews.getViewBySlug("print-shop", "guard-reject")).toBeNull();
  });

  it("creates a view landing in draft status for an admin-role session, via the real parsed form fields", async () => {
    currentAdminSession = sessionFor("admin");
    const formData = createFormData({
      slug: "admin-created",
      name: "Admin Created View",
      heroHeadline: "Admin Created Headline",
      heroSubheadline: "Admin created subheadline.",
      categoryIds: "cat-a, cat-b",
      themeKey: "editorial",
    });
    await createStorefrontViewAction(formData);

    const view = await crudStorefrontViews.getViewBySlug("print-shop", "admin-created");
    expect(view).not.toBeNull();
    expect(view!.status).toBe("draft");
    expect(view!.categoryIds).toEqual(["cat-a", "cat-b"]);
    expect(view!.themeKey).toBe("editorial");
  });

  it("publishView: draft -> active for an owner-role session; rejects a viewer-role session first", async () => {
    currentAdminSession = sessionFor("owner");
    await createStorefrontViewAction(createFormData({ slug: "publish-me", name: "Publish Me", heroHeadline: "Headline" }));
    const view = (await crudStorefrontViews.getViewBySlug("print-shop", "publish-me"))!;

    currentAdminSession = sessionFor("viewer");
    await expect(publishStorefrontViewAction(createFormData({ id: view.id }))).rejects.toThrow(/not authorized/i);
    expect((await crudStorefrontViews.getView(view.id))?.status).toBe("draft");

    currentAdminSession = sessionFor("owner");
    await publishStorefrontViewAction(createFormData({ id: view.id }));
    expect((await crudStorefrontViews.getView(view.id))?.status).toBe("active");
  });

  it("two DRAFT views may harmlessly share a slug, but publishing a second one while the first is ACTIVE throws DuplicateStorefrontViewSlugError -- and the failed publish leaves the second view untouched", async () => {
    currentAdminSession = sessionFor("owner");
    await createStorefrontViewAction(createFormData({ slug: "dup-slug", name: "Dup A", heroHeadline: "Headline A" }));
    await createStorefrontViewAction(createFormData({ slug: "dup-slug", name: "Dup B", heroHeadline: "Headline B" }));

    const views = await crudStorefrontViews.listViews("print-shop");
    const [a, b] = views.filter((v) => v.slug === "dup-slug");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // Creating both, still drafts, never threw -- the harmless half of the invariant.
    expect(a!.status).toBe("draft");
    expect(b!.status).toBe("draft");

    await publishStorefrontViewAction(createFormData({ id: a!.id }));
    expect((await crudStorefrontViews.getView(a!.id))?.status).toBe("active");

    // The conflicting half: publishing b while a is still active for the same demoSlug+slug rejects.
    await expect(publishStorefrontViewAction(createFormData({ id: b!.id }))).rejects.toThrow(DuplicateStorefrontViewSlugError);
    expect((await crudStorefrontViews.getView(b!.id))?.status).toBe("draft");
  });

  it("archiveView: active -> archived for an admin-role session, freeing the slug for the sibling draft to publish; rejects a viewer-role session first", async () => {
    currentAdminSession = sessionFor("owner");
    await createStorefrontViewAction(createFormData({ slug: "archive-slug", name: "Archive A", heroHeadline: "Headline A" }));
    await createStorefrontViewAction(createFormData({ slug: "archive-slug", name: "Archive B", heroHeadline: "Headline B" }));
    const [a, b] = (await crudStorefrontViews.listViews("print-shop")).filter((v) => v.slug === "archive-slug");
    await publishStorefrontViewAction(createFormData({ id: a!.id }));

    currentAdminSession = sessionFor("viewer");
    await expect(archiveStorefrontViewAction(createFormData({ id: a!.id }))).rejects.toThrow(/not authorized/i);
    expect((await crudStorefrontViews.getView(a!.id))?.status).toBe("active");

    currentAdminSession = sessionFor("admin");
    await archiveStorefrontViewAction(createFormData({ id: a!.id }));
    expect((await crudStorefrontViews.getView(a!.id))?.status).toBe("archived");

    // Slug now free -- b (still draft, from the shared-slug invariant above) can publish.
    await publishStorefrontViewAction(createFormData({ id: b!.id }));
    expect((await crudStorefrontViews.getView(b!.id))?.status).toBe("active");
  });
});

describe("real seeded views sanity check (lib/seed.ts, lib/seed-northline.ts, lib/seed-broadleaf.ts)", () => {
  it("print-shop's corporate-bulk view seeds active with sane, non-empty, real categoryIds", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    const storefrontViews = createStorefrontViewsService({ repository: createInMemoryStorefrontViewRepository() });
    // serviceAreas/bundles/recommendations/advertising/promotions/reviews all
    // skipped (undefined) -- this test only needs the storefrontViews param,
    // the 11th and last positional argument.
    await seedCatalog(catalog, marketingCatalog, cms, inventory, undefined, undefined, undefined, undefined, undefined, undefined, storefrontViews);

    const view = await storefrontViews.getViewBySlug("print-shop", "corporate-bulk");
    expect(view).not.toBeNull();
    expect(view!.status).toBe("active");
    expect(view!.isDefaultOverride).toBe(false);
    expect(view!.categoryIds.length).toBeGreaterThan(0);
    for (const id of view!.categoryIds) {
      expect(await marketingCatalog.getCategory(id), `expected real category ${id}`).not.toBeNull();
    }
  });

  it("northline's commercial view seeds active with sane, non-empty, real categoryIds", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    const storefrontViews = createStorefrontViewsService({ repository: createInMemoryStorefrontViewRepository() });
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory, undefined, undefined, undefined, undefined, undefined, storefrontViews);

    const view = await storefrontViews.getViewBySlug("northline", "commercial");
    expect(view).not.toBeNull();
    expect(view!.status).toBe("active");
    expect(view!.isDefaultOverride).toBe(false);
    expect(view!.categoryIds.length).toBeGreaterThan(0);
    for (const id of view!.categoryIds) {
      expect(await marketingCatalog.getCategory(id), `expected real category ${id}`).not.toBeNull();
    }
  });

  it("broadleaf's autumn-gift-guide view seeds active as a real time-boxed isDefaultOverride campaign with sane, non-empty categoryIds", async () => {
    const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
    const storefrontViews = createStorefrontViewsService({ repository: createInMemoryStorefrontViewRepository() });
    await seedBroadleafDemo(catalog, marketingCatalog, cms, inventory, undefined, undefined, undefined, undefined, undefined, storefrontViews);

    const view = await storefrontViews.getViewBySlug("broadleaf", "autumn-gift-guide");
    expect(view).not.toBeNull();
    expect(view!.status).toBe("active");
    expect(view!.isDefaultOverride).toBe(true);
    expect(view!.startsAt).toBe("2026-10-01T00:00:00Z");
    expect(view!.endsAt).toBe("2026-11-30T00:00:00Z");
    expect(view!.categoryIds.length).toBeGreaterThan(0);
    for (const id of view!.categoryIds) {
      expect(await marketingCatalog.getCategory(id), `expected real category ${id}`).not.toBeNull();
    }

    // And it's genuinely live inside its own real seeded window, not live outside it.
    expect(isViewLive(view!, new Date("2026-10-15T00:00:00Z"))).toBe(true);
    expect(isViewLive(view!, new Date("2026-09-15T00:00:00Z"))).toBe(false);
  });
});
