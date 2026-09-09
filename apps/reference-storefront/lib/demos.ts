import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";
import { seedCatalog } from "./seed";
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
export const DEMO_SLUGS = ["dragon-merch", "northline"] as const;

export type DemoSlug = (typeof DEMO_SLUGS)[number];

/** Runtime type guard -- needed because a demo slug will eventually come from a URL route param (a plain string), not something TypeScript can narrow for us at compile time. */
export function isDemoSlug(value: string): value is DemoSlug {
  return (DEMO_SLUGS as readonly string[]).includes(value);
}

/**
 * demo-routing-04: a fixed fallback demo slug for the handful of call sites
 * that render OUTSIDE any `/demo/[demoSlug]/...` route and so have no real
 * demoSlug to thread -- today that's just app/layout.tsx and app/page.tsx,
 * the pre-story-05 root landing page stub (design-discussion.md §3 says
 * these become a demo-agnostic framework landing page in demo-routing-05;
 * until that lands they still render one demo's theme/CMS content, same as
 * before this story, just via an explicit named constant instead of a
 * "TEMPORARY: hardcoded until routes move" shim comment that's now false --
 * routes have already moved). Every route actually under `/demo/[demoSlug]/`
 * must keep using its own real `params.demoSlug`, never this constant.
 */
export const DEFAULT_DEMO_SLUG: DemoSlug = "dragon-merch";

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
}

export type DemoSeedFn = (deps: DemoSeedDependencies) => Promise<void>;

export interface DemoDefinition {
  slug: DemoSlug;
  /** Human-readable name for navigation links etc. (landing/demo-layout work uses this). */
  displayName: string;
  seed: DemoSeedFn;
}

export const DEMO_REGISTRY: Record<DemoSlug, DemoDefinition> = {
  "dragon-merch": {
    slug: "dragon-merch",
    displayName: "Dragon Merch",
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
      ),
  },
  northline: {
    slug: "northline",
    displayName: "Northline Home Tech",
    seed: (deps) => seedNorthlineDemo(deps.catalog, deps.marketingCatalog, deps.cms, deps.serviceAreas),
  },
};
