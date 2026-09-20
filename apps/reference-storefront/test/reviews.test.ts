/**
 * bare-basics epic: @mercatus-liber/reviews (submit -> pending -> admin
 * moderates -> published-only-ever-shows-on-PDP) is fully wired into this
 * app -- submitReviewAction/publishReviewAction/rejectReviewAction (see
 * "bare-basics epic" in lib/actions.ts), the PDP's rating-summary/reviews
 * render path (app/demo/[demoSlug]/products/[slug]/page.tsx), and the admin
 * moderation queue's resolveProductLabel fallback
 * (app/demo/[demoSlug]/admin/reviews/page.tsx) -- but had zero coverage
 * anywhere in this app's own test suite before this file. The package
 * itself (packages/reviews) is unit-tested; none of this app's real wiring
 * was. This file proves the subsystem's single most important safety
 * invariant end to end, against the REAL in-memory-backed ReviewsService
 * (never a mock of it): a pending or rejected review NEVER appears via
 * listPublishedReviewsForProduct / getRatingSummary / the rendered PDP,
 * regardless of how it got into that state.
 *
 * getServicesForDemo is mocked wholesale (same shape as
 * admin-mutation-guard.test.ts and admin-user-management.test.ts) so
 * publishReviewAction/rejectReviewAction's requireAdminPermission gate can
 * be driven by an injectable AdminSession without a real Clerk account or
 * the dev-default adapter's cookie/env-var machinery -- every service
 * underneath (catalog, reviews, pdp, bundles, recommendations, media) is
 * the real, in-memory-backed implementation, so a "succeeds normally"
 * assertion here proves the actual state transition happened, not just that
 * no error was thrown. next/headers' cookies() is stubbed to "no cookie
 * present" (real cookies() throws "called outside a request scope" when
 * invoked directly outside a Next request, same as
 * cross-demo-cart-isolation.test.ts documents) -- this file never exercises
 * theme selection, so a stubbed empty cookie jar is enough to let
 * app/demo/[demoSlug]/products/[slug]/page.tsx's readActiveThemeBundle call
 * resolve to a harmless default.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createPassthroughImageAdapter } from "@mercatus-liber/media";
import { createPdpService } from "@mercatus-liber/pdp";
import { createInMemoryRecommendationRepository, createRecommendationsService } from "@mercatus-liber/recommendations";
import { createInMemoryReviewRepository, createReviewsService } from "@mercatus-liber/reviews";
import { createThemingService } from "@mercatus-liber/theming";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

let currentSession: AdminSession | null = null;

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

// Real, in-memory-backed services -- not mocks of the reviews subsystem
// itself. `seedCatalog` is called WITHOUT its optional `reviews` param
// (lib/seed.ts's own seedReviews demo content), per this task's own
// instruction not to rely on the app's seed data, which may change; every
// review in this file is seeded directly against the real ReviewsService
// below instead.
const events = createInMemoryEventBus();
const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices(events);
await seedCatalog(catalog, marketingCatalog, cms, inventory);

const theming = createThemingService();
const pdp = createPdpService({ catalog, theming });
const bundles = createBundlesService({ repository: createInMemoryBundleRepository(), skuLookup: catalog });
const recommendations = createRecommendationsService({ repository: createInMemoryRecommendationRepository() });
const media = createPassthroughImageAdapter();
const reviews = createReviewsService({ repository: createInMemoryReviewRepository(), events });

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({
    adminAuth: mockAdminAuth,
    catalog,
    marketingCatalog,
    cms,
    inventory,
    pdp,
    theming,
    bundles,
    recommendations,
    media,
    reviews,
  })),
}));

const { submitReviewAction, publishReviewAction, rejectReviewAction } = await import("../lib/actions.js");
const { default: ProductPage } = await import("../app/demo/[demoSlug]/products/[slug]/page.js");
const { default: AdminReviewsPage } = await import("../app/demo/[demoSlug]/admin/reviews/page.js");

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

/**
 * Flattens a React element tree (as returned by directly calling a Server
 * Component) to its rendered text content, without a DOM renderer -- same
 * base shape as cross-demo-cart-isolation.test.ts's own renderedText, which
 * additionally invokes function-component elements (e.g. PDP's
 * TEMPLATE_COMPONENTS-dispatched Component) since a React element for a
 * function component is just a lazy {type, props} description until
 * something actually calls it. Extended to be async and to await a
 * function component's return value -- PdpLongScroll
 * (components/pdp-long-scroll.tsx, the real default template for the
 * "editorial"-themed print-shop demo per DEMO_REGISTRY/theme-bundles.ts)
 * is itself an `async function` Server Component, so invoking it
 * synchronously here would yield an unresolved Promise (silently rendering
 * as empty text, no throw) instead of its real markup -- confirmed by hand
 * while writing this test.
 */
async function renderedText(node: ReactNode): Promise<string> {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return (await Promise.all(node.map(renderedText))).join("");
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as { type: unknown; props: { children?: ReactNode } };
    if (typeof element.type === "function") {
      try {
        const result = (element.type as (props: unknown) => ReactNode | Promise<ReactNode>)(element.props);
        return await renderedText(result instanceof Promise ? await result : result);
      } catch {
        return renderedText(element.props?.children);
      }
    }
    return renderedText(element.props?.children);
  }
  return "";
}

const testParams = (slug: string) => Promise.resolve({ demoSlug: "print-shop" as const, slug });
const emptySearchParams = Promise.resolve({});

describe("submitReviewAction (reviews app-layer wiring)", () => {
  it("lands a real FormData submission as a pending review with every field round-tripping", async () => {
    const product = await catalog.getProductBySlug("embroidered-canvas-tote");
    if (!product) throw new Error("expected the seeded embroidered-canvas-tote product");

    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("productId", product.id);
    formData.set("rating", "4");
    formData.set("authorName", "Priya S.");
    formData.set("title", "Sturdy and true to size");
    formData.set("body", "Held up great after a summer of farmers' market trips.");
    await submitReviewAction(formData);

    const pending = await reviews.listAllForModeration({ status: "pending" });
    const created = pending.find((r) => r.productId === product.id && r.authorName === "Priya S.");
    expect(created).toBeDefined();
    expect(created?.status).toBe("pending");
    expect(created?.rating).toBe(4);
    expect(created?.title).toBe("Sturdy and true to size");
    expect(created?.body).toBe("Held up great after a summer of farmers' market trips.");
  });

  it("never auto-publishes -- the same review is invisible to the published-only read path", async () => {
    const product = await catalog.getProductBySlug("embroidered-dad-cap");
    if (!product) throw new Error("expected the seeded embroidered-dad-cap product");

    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("productId", product.id);
    formData.set("rating", "5");
    formData.set("authorName", "Leak Check");
    formData.set("title", "Should not leak");
    formData.set("body", "This review is still pending and must not appear on the PDP.");
    await submitReviewAction(formData);

    const published = await reviews.listPublishedReviewsForProduct(product.id);
    expect(published.find((r) => r.authorName === "Leak Check")).toBeUndefined();

    const summary = await reviews.getRatingSummary(product.id);
    // No published reviews were ever seeded for this product in this test
    // file, so the whole summary reads exactly as if the pending review
    // doesn't exist -- a real zero-count summary, never NaN/undefined.
    expect(summary.count).toBe(0);
    expect(summary.average).toBe(0);
  });
});

describe("publishReviewAction / rejectReviewAction (reviews app-layer wiring, admin-gated)", () => {
  it("rejects a viewer-role session before moderating", async () => {
    const product = await catalog.getProductBySlug("monogram-stoneware-coaster-set");
    if (!product) throw new Error("expected the seeded monogram-stoneware-coaster-set product");
    const submitted = await reviews.submitReview({
      productId: product.id,
      rating: 3,
      authorName: "Guard Check",
      title: "Guard check",
      body: "Testing the moderation guard.",
    });

    currentSession = sessionFor("viewer");
    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("id", submitted.id);
    await expect(publishReviewAction(formData)).rejects.toThrow(/not authorized/i);

    expect((await reviews.getReview(submitted.id))?.status).toBe("pending");
  });

  it("pending -> published actually transitions the real service state and makes the review visible on the published-only read path", async () => {
    const product = await catalog.getProductBySlug("custom-printed-ceramic-mug");
    if (!product) throw new Error("expected the seeded custom-printed-ceramic-mug product");
    const submitted = await reviews.submitReview({
      productId: product.id,
      rating: 5,
      authorName: "Real Publish",
      title: "Genuinely great",
      body: "Publishing this via the real admin action.",
    });

    currentSession = sessionFor("admin");
    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("id", submitted.id);
    await publishReviewAction(formData);

    expect((await reviews.getReview(submitted.id))?.status).toBe("published");
    const published = await reviews.listPublishedReviewsForProduct(product.id);
    expect(published.map((r) => r.id)).toContain(submitted.id);
  });

  it("pending -> rejected actually transitions the real service state, and the rejected review never appears on the published-only read path", async () => {
    const product = await catalog.getProductBySlug("embroidered-fleece-hoodie");
    if (!product) throw new Error("expected the seeded embroidered-fleece-hoodie product");
    const submitted = await reviews.submitReview({
      productId: product.id,
      rating: 1,
      authorName: "Real Reject",
      title: "Off topic spam",
      body: "This should get rejected.",
    });

    currentSession = sessionFor("owner");
    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("id", submitted.id);
    await rejectReviewAction(formData);

    const rejected = await reviews.getReview(submitted.id);
    expect(rejected?.status).toBe("rejected");

    // Per Review.status's own doc comment (packages/reviews/src/types.ts):
    // "rejected" is a terminal, real moderation outcome. No rejected ->
    // published attempt is made here (that transition is deliberately out
    // of scope for this test) -- with no such attempt, the rejected review
    // must never show up via the published-only read path.
    const published = await reviews.listPublishedReviewsForProduct(product.id);
    expect(published.map((r) => r.id)).not.toContain(submitted.id);
    const summary = await reviews.getRatingSummary(product.id);
    expect(summary.count).toBe(0);
  });
});

describe("AdminReviewsPage resolveProductLabel (bare-basics epic, real product-name resolution in the moderation queue)", () => {
  it("resolves a review for a real, existing product to that product's actual title and a working PDP link", async () => {
    const product = await catalog.getProductBySlug("embroidered-cotton-tee");
    if (!product) throw new Error("expected the seeded embroidered-cotton-tee product");
    await reviews.submitReview({
      productId: product.id,
      rating: 4,
      authorName: "Label Check Real",
      title: "Real product label",
      body: "Should resolve to the real product title and slug.",
    });

    const element = await AdminReviewsPage({ params: Promise.resolve({ demoSlug: "print-shop" }) });
    const text = await renderedText(element);
    expect(text).toContain(product.title);
  });

  it("falls back to the raw productId (no throw, no crash) for a review whose product no longer exists", async () => {
    const unknownProductId = "deleted-product-does-not-exist-xyz";
    await reviews.submitReview({
      productId: unknownProductId,
      rating: 2,
      authorName: "Label Check Fallback",
      title: "Orphaned review",
      body: "This review's product was deleted.",
    });

    const element = await AdminReviewsPage({ params: Promise.resolve({ demoSlug: "print-shop" }) });
    const text = await renderedText(element);
    expect(text).toContain(unknownProductId);
  });
});

describe("PDP rendering (bare-basics epic, published-only reviews + rating summary)", () => {
  it("renders only published reviews with a rating summary computed from ONLY the published ones, seeded directly against the real ReviewsService", async () => {
    const product = await catalog.getProductBySlug("custom-printed-travel-tumbler");
    if (!product) throw new Error("expected the seeded custom-printed-travel-tumbler product");

    const publishedOne = await reviews.submitReview({
      productId: product.id,
      rating: 4,
      authorName: "Published Reviewer One",
      title: "Great tumbler",
      body: "Keeps coffee hot for hours.",
    });
    await reviews.moderateReview(publishedOne.id, "published");

    const publishedTwo = await reviews.submitReview({
      productId: product.id,
      rating: 2,
      authorName: "Published Reviewer Two",
      title: "Just okay",
      body: "Lid leaks a bit in a bag.",
    });
    await reviews.moderateReview(publishedTwo.id, "published");

    const stillPending = await reviews.submitReview({
      productId: product.id,
      rating: 5,
      authorName: "Pending Reviewer",
      title: "Should never render",
      body: "This review is still awaiting moderation.",
    });

    // Direct-service assertion, decoupled from rendering: average/count are
    // computed from ONLY the two published reviews ((4 + 2) / 2 = 3), never
    // the pending third one.
    const summary = await reviews.getRatingSummary(product.id);
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(3);

    const element = await ProductPage({ params: testParams(product.slug), searchParams: emptySearchParams });
    const text = await renderedText(element);

    expect(text).toContain("Great tumbler");
    expect(text).toContain("Published Reviewer One");
    expect(text).toContain("Just okay");
    expect(text).toContain("Published Reviewer Two");
    expect(text).toContain("3.0");
    expect(text).toContain("2 reviews");

    expect(text).not.toContain("Should never render");
    expect(text).not.toContain("Pending Reviewer");
    expect(stillPending.status).toBe("pending");
  });

  it("renders the 'no reviews yet' empty state and no rating line for a product with zero published reviews", async () => {
    const product = await catalog.getProductBySlug("embroidered-zip-pouch");
    if (!product) throw new Error("expected the seeded embroidered-zip-pouch product");

    const element = await ProductPage({ params: testParams(product.slug), searchParams: emptySearchParams });
    const text = await renderedText(element);

    expect(text).toMatch(/no reviews yet/i);
    expect(text).not.toMatch(/\(\d+ reviews?\)/);
  });
});
