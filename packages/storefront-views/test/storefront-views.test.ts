import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStorefrontViewRepository } from "../src/in-memory-repository.js";
import { createStorefrontViewsService, isViewLive, type StorefrontViewsService } from "../src/service.js";
import { DuplicateStorefrontViewSlugError, StorefrontViewNotFoundError } from "../src/types.js";
import type { NewStorefrontViewInput, StorefrontView, StorefrontViewRepository } from "../src/types.js";

function baseInput(overrides: Partial<NewStorefrontViewInput> = {}): NewStorefrontViewInput {
  return {
    demoSlug: "print-shop",
    slug: "gift-guide",
    name: "Gift Guide",
    heroHeadline: "The Gift Guide",
    heroSubheadline: "Curated picks for every occasion.",
    categoryIds: ["cat-1"],
    ...overrides,
  };
}

describe("storefront views service", () => {
  let repository: StorefrontViewRepository;
  let views: StorefrontViewsService;

  beforeEach(() => {
    repository = createInMemoryStorefrontViewRepository();
    views = createStorefrontViewsService({ repository });
  });

  describe("createView", () => {
    it("assigns an id, defaults status to draft, isDefaultOverride to false, themeKey/startsAt/endsAt to null", async () => {
      const view = await views.createView(baseInput());
      expect(view.id).toBeTruthy();
      expect(view.status).toBe("draft");
      expect(view.isDefaultOverride).toBe(false);
      expect(view.themeKey).toBeNull();
      expect(view.startsAt).toBeNull();
      expect(view.endsAt).toBeNull();
    });

    it("honors explicit isDefaultOverride/themeKey/startsAt/endsAt", async () => {
      const view = await views.createView(
        baseInput({ isDefaultOverride: true, themeKey: "maximalist", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }),
      );
      expect(view.isDefaultOverride).toBe(true);
      expect(view.themeKey).toBe("maximalist");
      expect(view.startsAt).toBe("2026-10-01T00:00:00Z");
      expect(view.endsAt).toBe("2026-11-01T00:00:00Z");
    });
  });

  describe("publishView", () => {
    it("draft -> active", async () => {
      const view = await views.createView(baseInput());
      const published = await views.publishView(view.id);
      expect(published.status).toBe("active");
    });

    it("throws StorefrontViewNotFoundError for an unknown id", async () => {
      await expect(views.publishView("missing")).rejects.toThrow(StorefrontViewNotFoundError);
    });

    it("throws DuplicateStorefrontViewSlugError when another ACTIVE view for the same demo already claims this slug", async () => {
      const a = await views.createView(baseInput());
      const b = await views.createView(baseInput());
      await views.publishView(a.id);
      await expect(views.publishView(b.id)).rejects.toThrow(DuplicateStorefrontViewSlugError);
    });

    it("allows two DRAFT views to share a slug harmlessly -- only publishing the second one conflicts", async () => {
      const a = await views.createView(baseInput());
      const b = await views.createView(baseInput());
      expect(a.slug).toBe(b.slug);
      // Neither published yet -- no error just from creating both.
      expect((await views.getView(a.id))?.status).toBe("draft");
      expect((await views.getView(b.id))?.status).toBe("draft");
    });

    it("the same slug is fine across two DIFFERENT demos -- uniqueness is scoped per demoSlug", async () => {
      const a = await views.createView(baseInput({ demoSlug: "print-shop" }));
      const b = await views.createView(baseInput({ demoSlug: "northline" }));
      await expect(views.publishView(a.id)).resolves.toBeTruthy();
      await expect(views.publishView(b.id)).resolves.toBeTruthy();
    });
  });

  describe("archiveView", () => {
    it("active -> archived, and frees the slug for a new view to reuse", async () => {
      const a = await views.createView(baseInput());
      await views.publishView(a.id);
      const archived = await views.archiveView(a.id);
      expect(archived.status).toBe("archived");

      const b = await views.createView(baseInput());
      await expect(views.publishView(b.id)).resolves.toMatchObject({ status: "active" });
    });
  });

  describe("isViewLive (pure)", () => {
    const now = new Date("2026-10-15T12:00:00Z");

    function liveCandidate(overrides: Partial<StorefrontView> = {}): StorefrontView {
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
        createdAt: now.toISOString(),
        ...overrides,
      };
    }

    it("a draft view is never live, regardless of window", () => {
      expect(isViewLive(liveCandidate({ status: "draft" }), now)).toBe(false);
    });

    it("an archived view is never live", () => {
      expect(isViewLive(liveCandidate({ status: "archived" }), now)).toBe(false);
    });

    it("an active view with no window at all is always live", () => {
      expect(isViewLive(liveCandidate(), now)).toBe(true);
    });

    it("an active view is NOT live before its startsAt", () => {
      const view = liveCandidate({ startsAt: "2026-11-01T00:00:00Z" });
      expect(isViewLive(view, now)).toBe(false);
    });

    it("an active view IS live on/after its startsAt with no endsAt", () => {
      const view = liveCandidate({ startsAt: "2026-10-01T00:00:00Z" });
      expect(isViewLive(view, now)).toBe(true);
    });

    it("an active view is NOT live at or after its endsAt (end is exclusive)", () => {
      const view = liveCandidate({ endsAt: "2026-10-15T12:00:00Z" });
      expect(isViewLive(view, now)).toBe(false);
    });

    it("an active view IS live just before its endsAt", () => {
      const view = liveCandidate({ endsAt: "2026-10-15T12:00:01Z" });
      expect(isViewLive(view, now)).toBe(true);
    });

    it("a real full campaign window: live inside it, not live before or after", () => {
      const view = liveCandidate({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" });
      expect(isViewLive(view, new Date("2026-09-30T23:59:59Z"))).toBe(false);
      expect(isViewLive(view, new Date("2026-10-15T00:00:00Z"))).toBe(true);
      expect(isViewLive(view, new Date("2026-11-01T00:00:00Z"))).toBe(false);
    });
  });

  describe("getActiveDefaultOverride -- the real 'swap over the home page' mechanism", () => {
    it("returns null when no view for this demo is a default override", async () => {
      const view = await views.createView(baseInput({ isDefaultOverride: false }));
      await views.publishView(view.id);
      expect(await views.getActiveDefaultOverride("print-shop")).toBeNull();
    });

    it("returns null when the default-override view exists but isn't published yet", async () => {
      await views.createView(baseInput({ isDefaultOverride: true }));
      expect(await views.getActiveDefaultOverride("print-shop")).toBeNull();
    });

    it("returns the view once published, when it has no time window", async () => {
      const view = await views.createView(baseInput({ isDefaultOverride: true }));
      await views.publishView(view.id);
      const active = await views.getActiveDefaultOverride("print-shop");
      expect(active?.id).toBe(view.id);
    });

    it("returns null before the campaign window opens, the view once it's inside the window, and null again after it closes -- the automatic-revert behavior", async () => {
      const view = await views.createView(
        baseInput({ isDefaultOverride: true, startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }),
      );
      await views.publishView(view.id);

      expect(await views.getActiveDefaultOverride("print-shop", new Date("2026-09-01T00:00:00Z"))).toBeNull();
      expect((await views.getActiveDefaultOverride("print-shop", new Date("2026-10-15T00:00:00Z")))?.id).toBe(view.id);
      expect(await views.getActiveDefaultOverride("print-shop", new Date("2026-11-15T00:00:00Z"))).toBeNull();
    });

    it("never returns a default-override view seeded for a DIFFERENT demoSlug", async () => {
      const view = await views.createView(baseInput({ demoSlug: "northline", isDefaultOverride: true }));
      await views.publishView(view.id);
      expect(await views.getActiveDefaultOverride("print-shop")).toBeNull();
      expect((await views.getActiveDefaultOverride("northline"))?.id).toBe(view.id);
    });
  });
});
