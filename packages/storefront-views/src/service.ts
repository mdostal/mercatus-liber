import { randomUUID } from "node:crypto";
import {
  DuplicateStorefrontViewSlugError,
  StorefrontViewNotFoundError,
  type NewStorefrontViewInput,
  type StorefrontView,
  type StorefrontViewRepository,
  type UpdateStorefrontViewInput,
} from "./types.js";

/**
 * Pure predicate, exported so app-layer route handlers can reuse the exact
 * same logic getActiveDefaultOverride uses internally, rather than
 * re-deriving it: a view is genuinely live right now only when it has been
 * explicitly published ("active") AND, if it carries a real startsAt/endsAt
 * window, the given moment falls inside it. `startsAt`/`endsAt` are each
 * independently optional -- a view can have a start with no end (opens on a
 * date, runs forever after), an end with no start (live immediately, closes
 * on a date), both (a real time-boxed campaign), or neither (a permanent
 * second storefront, gated by status alone).
 */
export function isViewLive(view: StorefrontView, now: Date = new Date()): boolean {
  if (view.status !== "active") return false;
  if (view.startsAt && now < new Date(view.startsAt)) return false;
  if (view.endsAt && now >= new Date(view.endsAt)) return false;
  return true;
}

export interface StorefrontViewsService {
  createView(input: NewStorefrontViewInput): Promise<StorefrontView>;
  getView(id: string): Promise<StorefrontView | null>;
  getViewBySlug(demoSlug: string, slug: string): Promise<StorefrontView | null>;
  listViews(demoSlug: string): Promise<StorefrontView[]>;
  updateView(id: string, patch: UpdateStorefrontViewInput): Promise<StorefrontView>;
  /** draft -> active. Throws DuplicateStorefrontViewSlugError if another ACTIVE view for the same demoSlug already claims this slug (two draft views may share a slug harmlessly; only one may ever be live at a time). */
  publishView(id: string): Promise<StorefrontView>;
  archiveView(id: string): Promise<StorefrontView>;
  /**
   * The one real point of the whole mechanism: among this store's views,
   * the first `isDefaultOverride` view that's currently live (see
   * isViewLive) -- null if none. A real store's home-page route calls this
   * to decide whether to render the normal seeded home page or this view's
   * takeover instead. Always computed fresh against `now` -- never cached
   * or stamped, so a campaign's window ending reverts the home page on the
   * very next request, automatically.
   */
  getActiveDefaultOverride(demoSlug: string, now?: Date): Promise<StorefrontView | null>;
}

export function createStorefrontViewsService(deps: { repository: StorefrontViewRepository }): StorefrontViewsService {
  const { repository } = deps;

  async function requireView(id: string): Promise<StorefrontView> {
    const view = await repository.get(id);
    if (!view) throw new StorefrontViewNotFoundError(id);
    return view;
  }

  return {
    async createView(input: NewStorefrontViewInput): Promise<StorefrontView> {
      const view: StorefrontView = {
        id: randomUUID(),
        demoSlug: input.demoSlug,
        slug: input.slug,
        name: input.name,
        heroHeadline: input.heroHeadline,
        heroSubheadline: input.heroSubheadline,
        categoryIds: input.categoryIds,
        themeKey: input.themeKey ?? null,
        isDefaultOverride: input.isDefaultOverride ?? false,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      await repository.save(view);
      return view;
    },

    async getView(id: string): Promise<StorefrontView | null> {
      return repository.get(id);
    },

    async getViewBySlug(demoSlug: string, slug: string): Promise<StorefrontView | null> {
      return repository.getBySlug(demoSlug, slug);
    },

    async listViews(demoSlug: string): Promise<StorefrontView[]> {
      return repository.listByDemoSlug(demoSlug);
    },

    async updateView(id: string, patch: UpdateStorefrontViewInput): Promise<StorefrontView> {
      const existing = await requireView(id);
      const updated: StorefrontView = { ...existing, ...patch };
      await repository.save(updated);
      return updated;
    },

    async publishView(id: string): Promise<StorefrontView> {
      const existing = await requireView(id);
      const siblings = await repository.listByDemoSlug(existing.demoSlug);
      const clash = siblings.find((v) => v.id !== id && v.slug === existing.slug && v.status === "active");
      if (clash) throw new DuplicateStorefrontViewSlugError(existing.demoSlug, existing.slug);
      const updated: StorefrontView = { ...existing, status: "active" };
      await repository.save(updated);
      return updated;
    },

    async archiveView(id: string): Promise<StorefrontView> {
      const existing = await requireView(id);
      const updated: StorefrontView = { ...existing, status: "archived" };
      await repository.save(updated);
      return updated;
    },

    async getActiveDefaultOverride(demoSlug: string, now: Date = new Date()): Promise<StorefrontView | null> {
      const views = await repository.listByDemoSlug(demoSlug);
      return views.find((view) => view.isDefaultOverride && isViewLive(view, now)) ?? null;
    },
  };
}
