/**
 * "draft" never renders anywhere. "active" renders at this view's own
 * /site/<slug> route (subject to the optional startsAt/endsAt window below
 * -- see isViewLive). "archived" is a real, kept terminal state (a past
 * seasonal takeover stays in the list, never deleted) rather than a delete.
 */
export type StorefrontViewStatus = "draft" | "active" | "archived";

export interface StorefrontView {
  id: string;
  /** Which store's already-real catalog this view curates -- a bare string id (this package never imports the app's own DemoSlug type, same structural-dependency posture as every other core-only subsystem here). */
  demoSlug: string;
  /** Unique within a given demoSlug -- becomes the real route /demo/<demoSlug>/site/<slug>. */
  slug: string;
  name: string;
  heroHeadline: string;
  heroSubheadline: string;
  /** Real category ids (from that store's own MarketingCatalogService) curated into this view's nav/grid -- the actual product/PDP/category pages are NOT duplicated; this only narrows which categories this view's own home surfaces. Empty array = every top-level category (rare -- a view usually exists specifically to narrow things down). */
  categoryIds: string[];
  /** An @mercatus-liber/theming ThemeBundle key override -- null means inherit whatever theme the parent store currently has active. */
  themeKey: string | null;
  /**
   * When true AND this view is currently live (see isViewLive), it
   * REPLACES the store's normal home page at /demo/<demoSlug> -- the real
   * "swap over your current site for an event" mechanic. When the view's
   * own window ends (or it's archived), the store's home page reverts
   * automatically -- no manual revert action, since this is re-evaluated
   * fresh on every request, never cached/stamped.
   * false means this view only ever lives at its own permanent
   * /site/<slug> route, alongside (never instead of) the normal store
   * home -- the "two differently-curated storefronts over one shared
   * catalog" pattern.
   */
  isDefaultOverride: boolean;
  /** ISO 8601, or null for no start bound (live as soon as status is "active"). */
  startsAt: string | null;
  /** ISO 8601, or null for no end bound (a permanent second storefront, not a time-boxed campaign). */
  endsAt: string | null;
  status: StorefrontViewStatus;
  createdAt: string;
}

export interface NewStorefrontViewInput {
  demoSlug: string;
  slug: string;
  name: string;
  heroHeadline: string;
  heroSubheadline: string;
  categoryIds: string[];
  themeKey?: string | null;
  isDefaultOverride?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export type UpdateStorefrontViewInput = Partial<NewStorefrontViewInput>;

/** Adapter pattern, as everywhere else in this codebase. */
export interface StorefrontViewRepository {
  get(id: string): Promise<StorefrontView | null>;
  getBySlug(demoSlug: string, slug: string): Promise<StorefrontView | null>;
  listByDemoSlug(demoSlug: string): Promise<StorefrontView[]>;
  save(view: StorefrontView): Promise<void>;
}

export class StorefrontViewNotFoundError extends Error {
  constructor(id: string) {
    super(`Storefront view not found: ${id}`);
    this.name = "StorefrontViewNotFoundError";
  }
}

export class DuplicateStorefrontViewSlugError extends Error {
  constructor(demoSlug: string, slug: string) {
    super(`A storefront view with slug "${slug}" already exists for demo "${demoSlug}"`);
    this.name = "DuplicateStorefrontViewSlugError";
  }
}
