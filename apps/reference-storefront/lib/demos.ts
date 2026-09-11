import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { PromotionsService } from "@mercatus-liber/promotions";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ReviewsService } from "@mercatus-liber/reviews";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";
import { seedCatalog } from "./seed";
import { seedBroadleafDemo } from "./seed-broadleaf";
// seedNorthlineDemo actually lives in its own module (lib/seed-northline.ts),
// not lib/seed.ts -- imported from its real location rather than re-exported
// through lib/seed.ts to avoid introducing an indirection lib/seed.ts itself
// doesn't have today.
import { seedNorthlineDemo } from "./seed-northline";

/**
 * The known demo identifiers this app can serve. See
 * .pHive/epics/commerce-landing-and-demo-routing/docs/design-discussion.md
 * §3 -- this registry replaces the old `DEMO_BRAND` env var: a route param
 * (`app/demo/[demoSlug]/...`, landing in a later story of this same epic)
 * picks the demo instead of a build-time environment variable.
 */
export const DEMO_SLUGS = ["print-shop", "northline", "broadleaf"] as const;

export type DemoSlug = (typeof DEMO_SLUGS)[number];

/** Runtime type guard -- needed because a demo slug will eventually come from a URL route param (a plain string), not something TypeScript can narrow for us at compile time. */
export function isDemoSlug(value: string): value is DemoSlug {
  return (DEMO_SLUGS as readonly string[]).includes(value);
}

/**
 * demo-routing-04: a fixed fallback demo slug, originally for the handful
 * of call sites that rendered OUTSIDE any `/demo/[demoSlug]/...` route and
 * so had no real demoSlug to thread -- that was app/layout.tsx and
 * app/page.tsx, the pre-story-05 root landing page stub. demo-routing-05
 * moved that content to app/demo/[demoSlug]/page.tsx (using its own real
 * `params.demoSlug`) and gave the actual root ("/") a demo-agnostic
 * framework landing page (app/(landing)/page.tsx) that needs no demo
 * context at all -- so as of demo-routing-05 there is no remaining call
 * site for this constant. Left in place (not removed) as a documented,
 * explicit default for any future call site that genuinely needs one,
 * rather than a bare string literal repeated ad hoc. Every route actually
 * under `/demo/[demoSlug]/` must keep using its own real
 * `params.demoSlug`, never this constant.
 */
export const DEFAULT_DEMO_SLUG: DemoSlug = "print-shop";

/**
 * The full set of already-constructed services a demo's seed function might
 * need to draw on. `seedCatalog` and `seedNorthlineDemo` each take a
 * different subset of these as positional params (see lib/seed.ts and
 * lib/seed-northline.ts) -- this common shape lets the registry hold one
 * uniform function signature per demo regardless, so lib/services.ts's
 * buildServices() doesn't need its own per-demo branching.
 */
export interface DemoSeedDependencies {
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  cms: CmsService;
  inventory: InventoryAdapter;
  serviceAreas: ServiceAreaService;
  bundles: BundlesService;
  recommendations: RecommendationsService;
  advertising: AdvertisingService;
  /** promotions-real-demo-data epic: additive -- a seed fn that doesn't destructure this keeps working unchanged, same as any other dep here a given demo doesn't use. */
  promotions: PromotionsService;
  /** bare-basics epic: additive, same posture as promotions above. */
  reviews: ReviewsService;
}

export type DemoSeedFn = (deps: DemoSeedDependencies) => Promise<void>;

export interface DemoDefinition {
  slug: DemoSlug;
  /** Human-readable name for navigation links etc. (landing/demo-layout work uses this). */
  displayName: string;
  /**
   * seo-01: a real, one-sentence description of what this demo actually
   * sells (not generic cart copy) -- the demo layout's root generateMetadata
   * uses this as the fallback `<meta name="description">` for every route
   * under this demo that doesn't define its own more specific one. Sourced
   * from each demo's own real seed data (lib/seed.ts / lib/seed-northline.ts
   * / lib/seed-broadleaf.ts's actual category/product titles), not invented.
   */
  description: string;
  seed: DemoSeedFn;
  /**
   * The @mercatus-liber/theming ThemeBundle key this demo opens with on a
   * fresh (no theme cookie) visit -- see design-discussion.md §1c.
   * lib/theme-cookie.ts's readActiveThemeBundle() falls back to this (via
   * getThemeBundle) before falling back to THEME_BUNDLES[0]; a cookie, once
   * set (the visitor manually switched themes), always still wins. Optional
   * so a future demo with no particular default keeps today's exact
   * THEME_BUNDLES[0] behavior.
   */
  defaultThemeKey?: string;
}

export const DEMO_REGISTRY: Record<DemoSlug, DemoDefinition> = {
  "print-shop": {
    slug: "print-shop",
    displayName: "The Print Shop",
    description:
      "Custom embroidery, coasters, apparel, and drinkware -- small-batch print and stitch goods made to order.",
    // The warm artisan-market bundle -- the closest fit for a hand-crafted
    // embroidery/coasters shop (design-discussion.md §1c).
    defaultThemeKey: "editorial",
    seed: (deps) =>
      seedCatalog(
        deps.catalog,
        deps.marketingCatalog,
        deps.cms,
        deps.inventory,
        deps.serviceAreas,
        deps.bundles,
        deps.recommendations,
        deps.advertising,
        deps.promotions,
        deps.reviews,
      ),
  },
  northline: {
    slug: "northline",
    displayName: "Northline Home Tech",
    description:
      "TV mounting, home theater, security cameras, networking, and smart home automation -- installed by Northline Home Tech.",
    // Northline never had a real default either (it always silently fell
    // back to THEME_BUNDLES[0], "classic") -- this retroactively fixes that,
    // finally actually applying its own existing bundle by default (design-
    // discussion.md §1c).
    defaultThemeKey: "northline",
    seed: (deps) =>
      seedNorthlineDemo(
        deps.catalog,
        deps.marketingCatalog,
        deps.cms,
        deps.serviceAreas,
        deps.inventory,
        deps.promotions,
        deps.bundles,
        deps.recommendations,
        deps.advertising,
        deps.reviews,
      ),
  },
  broadleaf: {
    slug: "broadleaf",
    displayName: "Broadleaf & Co.",
    description:
      "An eclectic artisan marketplace for houseplants, ceramics & planters, hand-woven textiles, and letterpress paper goods.",
    // The warm orange/pink playful bundle -- not yet any demo's default
    // (print-shop -> "editorial", northline -> "northline") and a genuine
    // fit for a colorful, eclectic craft-market identity (design-
    // discussion.md §1d).
    defaultThemeKey: "vibrant",
    seed: (deps) =>
      seedBroadleafDemo(
        deps.catalog,
        deps.marketingCatalog,
        deps.cms,
        deps.inventory,
        deps.promotions,
        deps.bundles,
        deps.recommendations,
        deps.advertising,
        deps.reviews,
      ),
  },
};
