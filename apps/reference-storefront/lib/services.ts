import { cookies } from "next/headers";
import { createAccountService, createInMemoryCustomerProfileRepository, type AccountService } from "@mercatus-liber/account";
import { createClerkAdminAuthAdapter } from "@mercatus-liber/adapter-clerk";
import { createSanityAdapter } from "@mercatus-liber/adapter-sanity";
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { ADMIN_DEV_SESSION_COOKIE, createDefaultAdminAuthAdapter, type AdminAuthAdapter } from "@mercatus-liber/admin-auth";
import {
  createAdvertisingService,
  createInMemoryCampaignRepository,
  type AdvertisingService,
} from "@mercatus-liber/advertising";
import {
  createNoopAdapter,
  createPostHogAdapter,
  registerAnalyticsSync,
  type AnalyticsAdapter,
} from "@mercatus-liber/analytics";
import { createBundlesService, createInMemoryBundleRepository, type BundlesService } from "@mercatus-liber/bundles";
import { createCartService, createInMemoryCartRepository, type CartService } from "@mercatus-liber/cart";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import {
  createCmsService,
  createComponentRegistry,
  createInMemoryCmsAdapter,
  type CmsService,
} from "@mercatus-liber/cms";
import {
  createCheckoutOrdersService,
  createInMemoryOrderRepository,
  type CheckoutOrdersService,
} from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import {
  createDefaultBiAdapter,
  createInMemoryBiEventLogRepository,
  registerBiEventLogSync,
  type BiMetricsAdapter,
} from "@mercatus-liber/internal-bi";
import { createInMemoryInventoryAdapter, registerInventorySync, type InventoryAdapter } from "@mercatus-liber/inventory";
import { createOrderNotificationPlugin, createPluginRegistry, type OrderNotificationPlugin, type PluginRegistry } from "@mercatus-liber/plugins";
import { createInMemoryPromotionRepository, createPromotionsService, type PromotionsService } from "@mercatus-liber/promotions";
import {
  createInMemoryRecommendationRepository,
  createRecommendationsService,
  type RecommendationsService,
} from "@mercatus-liber/recommendations";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
  type MarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { createStripeAdapter, type PaymentAdapter } from "@mercatus-liber/payments";
import { createPdpService, type PdpService } from "@mercatus-liber/pdp";
import { createInMemoryIndex, registerCatalogSearchSync, type SearchIndexAdapter } from "@mercatus-liber/search";
import {
  createInMemoryServiceAreaProductRepository,
  createInMemoryServiceAreaRepository,
  createServiceAreaService,
  type ServiceAreaService,
} from "@mercatus-liber/service-areas";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import { seedCatalog } from "./seed";
import { seedNorthlineDemo } from "./seed-northline";

/**
 * THE ONLY MODULE IN THIS REPO that imports concrete adapter implementations
 * (adapter-sqlite, the Stripe payment adapter). Every subsystem package
 * (catalog/cart/payments/checkout-orders) only ever depends on
 * @mercatus-liber/core plus narrow structural interfaces -- this module is
 * where a real deployment chooses and wires concrete implementations together.
 * See docs/ARCHITECTURE.md's prime directive and cf-07's acceptance criteria.
 *
 * Uses an in-memory SQLite DB and in-memory cart/order repositories, matching
 * this app's documented purpose: a proof of integration/demo, not a persistent
 * production storefront (see this package's own README and package.json
 * description).
 */
export interface Services {
  events: EventBus;
  analytics: AnalyticsAdapter;
  catalog: CatalogService;
  cart: CartService;
  checkout: CheckoutOrdersService;
  marketingCatalog: MarketingCatalogService;
  search: SearchIndexAdapter;
  theming: ThemingService;
  pdp: PdpService;
  cms: CmsService;
  account: AccountService;
  inventory: InventoryAdapter;
  serviceAreas: ServiceAreaService;
  plugins: PluginRegistry;
  orderNotificationPlugin: OrderNotificationPlugin;
  promotions: PromotionsService;
  bundles: BundlesService;
  recommendations: RecommendationsService;
  advertising: AdvertisingService;
  bi: BiMetricsAdapter;
  adminAuth: AdminAuthAdapter;
}

/**
 * The Stripe SDK throws synchronously at construction time ("Neither apiKey
 * nor config.authenticator provided") when given an empty secretKey --
 * which would otherwise break every page in this app, not just checkout,
 * since `checkout` here is also used to build `account`/`inventory` (via
 * their structural OrderLookup dependency) and so can't simply be built
 * lazily as a whole the way shop.mdostal.com's own services.ts does. This
 * wrapper defers constructing the real Stripe client until a payment
 * method is actually called, so pages that never touch checkout never pay
 * for (or fail on) an unconfigured Stripe key.
 */
function createLazyStripeAdapter(config: { secretKey: string; webhookSecret: string; events: EventBus }): PaymentAdapter {
  let real: PaymentAdapter | null = null;
  function get(): PaymentAdapter {
    if (!real) real = createStripeAdapter(config);
    return real;
  }
  return {
    createPaymentSession: (input) => get().createPaymentSession(input),
    confirmPayment: (sessionId) => get().confirmPayment(sessionId),
    handleWebhookEvent: (rawBody, signature) => get().handleWebhookEvent(rawBody, signature),
  };
}

/**
 * Wraps createDefaultAdminAuthAdapter's dependency-injected cookie reader
 * (subsystem 21, @mercatus-liber/admin-auth) with a real next/headers
 * cookies() lookup. That adapter's `getSessionCookie` dependency is
 * synchronous (`() => string | undefined`), matching how the package (which
 * depends on @mercatus-liber/core only, no Next.js) was designed -- but
 * Next's own `cookies()` is async (`Promise<ReadonlyRequestCookies>`, see
 * node_modules/next/dist/server/request/cookies.d.ts). This wrapper's own
 * getCurrentSession() awaits cookies() first, stashes the resolved value in
 * `latestCookieValue`, then calls straight into the base adapter's
 * getCurrentSession() (which has no `await` before it reads the injected
 * closure -- see default-adapter.ts), so the read-then-consume pair below
 * never has an await between them and nothing from a concurrent request can
 * interleave in that window.
 */
function createDevAdminAuthAdapter(): AdminAuthAdapter {
  let latestCookieValue: string | undefined;
  const base = createDefaultAdminAuthAdapter({ getSessionCookie: () => latestCookieValue });
  return {
    ...base,
    async getCurrentSession() {
      const cookieStore = await cookies();
      latestCookieValue = cookieStore.get(ADMIN_DEV_SESSION_COOKIE)?.value;
      return base.getCurrentSession();
    },
  };
}

let servicesPromise: Promise<Services> | null = null;

async function buildServices(): Promise<Services> {
  const events = createInMemoryEventBus();

  // PostHog by default when a key is configured; no-op otherwise -- same
  // documented "empty config -> harmless fallback" pattern as the Stripe
  // adapter's empty secretKey. Wired before seeding so demo/seed activity
  // is covered by the same event-bus subscription real requests get.
  const analytics: AnalyticsAdapter = process.env.POSTHOG_API_KEY
    ? createPostHogAdapter({ apiKey: process.env.POSTHOG_API_KEY, host: process.env.POSTHOG_HOST })
    : createNoopAdapter();
  registerAnalyticsSync({ events, analytics });

  // Real Clerk adapter when a real Clerk account is configured; the
  // zero-infra, local-development-only dev default otherwise -- same
  // two-branch "env var truthy picks the real adapter, else a harmless
  // local fallback" shape as the analytics branch above (see
  // admin-auth-03-route-and-mutation-gating.yaml). CLERK_SECRET_KEY is also
  // the single signal apps/reference-storefront/app/layout.tsx and
  // app/admin/layout.tsx use to decide whether to render any Clerk UI at
  // all -- clerkMiddleware()/<ClerkProvider> both throw immediately when
  // Clerk isn't actually configured (confirmed by reading @clerk/nextjs's
  // own source), so every one of those call sites must agree on the same
  // "is Clerk configured" check.
  const adminAuth: AdminAuthAdapter = process.env.CLERK_SECRET_KEY
    ? createClerkAdminAuthAdapter()
    : createDevAdminAuthAdapter();

  const persistence = createSqliteAdapter(":memory:");
  const catalog = createCatalogService({ persistence, events });

  const cart = createCartService({
    repository: createInMemoryCartRepository(),
    skus: catalog,
    events,
  });

  const payments = createLazyStripeAdapter({
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    events,
  });

  const promotions = createPromotionsService({
    repository: createInMemoryPromotionRepository(),
    events,
  });

  // checkout's PricingAdjustment (per design-discussion.md §3) carries only
  // appliedCode, not promotions' own appliedPromotionId -- so this tiny cache
  // bridges the two at the boundary, letting recordApplication (called with
  // just an appliedCode) find the promotionId recordAppliedPromotion needs.
  const promotionIdByAppliedCode = new Map<string, string>();

  // `promotions` structurally satisfies checkout's PricingAdjuster interface
  // (computeAdjustment via evaluate(), recordApplication via
  // recordAppliedPromotion()) -- not a direct pass-through, since the two
  // services' field names/shapes differ slightly at the boundary (evaluate()
  // returns appliedPromotionId; PricingAdjustment carries only appliedCode).
  const checkout = createCheckoutOrdersService({
    repository: createInMemoryOrderRepository(),
    cart,
    payments,
    events,
    pricing: {
      async computeAdjustment(input) {
        const evaluation = await promotions.evaluate(input);
        if (evaluation.appliedCode && evaluation.appliedPromotionId) {
          promotionIdByAppliedCode.set(evaluation.appliedCode, evaluation.appliedPromotionId);
        }
        return {
          items: evaluation.items,
          discountTotal: evaluation.discountTotal,
          total: evaluation.total,
          appliedCode: evaluation.appliedCode,
        };
      },
      // Only ever called by startCheckout when adjustment.appliedCode is
      // non-null, so the code -> promotionId lookup below always resolves.
      async recordApplication(input) {
        const promotionId = promotionIdByAppliedCode.get(input.appliedCode);
        if (!promotionId) return;
        await promotions.recordAppliedPromotion({
          orderId: input.orderId,
          promotionId,
          discountAmount: input.discountAmount,
        });
      },
    },
  });

  // `catalog` structurally satisfies bundles' own narrow SkuPriceLookup
  // interface (getSku(id) -> { id, price, title? }) already -- no adapter
  // object needed, same structural-satisfaction pattern used for
  // account/inventory's OrderLookup below.
  const bundles = createBundlesService({
    repository: createInMemoryBundleRepository(),
    skuLookup: catalog,
  });

  // Core-only dependency, mirroring promotions/bundles exactly (see
  // design-discussion.md §3 for upsell-cross-sell) -- never imports catalog,
  // cart, or analytics. The same-category fallback used when a product has
  // no curated rule is app-composed orchestration in the PDP/cart pages
  // themselves, not a dependency this service needs.
  const recommendations = createRecommendationsService({
    repository: createInMemoryRecommendationRepository(),
  });

  // Core-only dependency, mirroring promotions/bundles/recommendations
  // exactly (see design-discussion.md §3 for the advertising epic) -- never
  // imports cms/service-areas/catalog. Targeting is resolved at the
  // app-composition layer (cms-sections.tsx's AdSlot), not here.
  const advertising = createAdvertisingService({
    repository: createInMemoryCampaignRepository(),
  });

  const marketingCatalog = createMarketingCatalogService({
    categories: createInMemoryCategoryRepository(),
    assignments: createInMemoryProductCategoryRepository(),
    attributes: catalog,
  });

  // Search index -- default in-memory adapter, kept in sync by reacting to
  // catalog events only (see @mercatus-liber/search's own decoupling test).
  // Registered before seeding so the seeded products get indexed as their
  // creation/publish events fire.
  const search = createInMemoryIndex();
  registerCatalogSearchSync({ events, index: search, products: catalog });

  const theming = createThemingService();
  const pdp = createPdpService({ catalog, theming });

  // Real Sanity adapter when a real Sanity project is configured; the
  // zero-infra in-memory adapter otherwise -- same two-branch "env var
  // truthy picks the real adapter, else a harmless local fallback" shape as
  // the analytics/admin-auth branches above (see
  // cms-disc-01-wire-and-document.yaml). SANITY_DATASET defaults to
  // Sanity's own conventional "production" dataset name when unset.
  const cmsPersistence = process.env.SANITY_PROJECT_ID
    ? createSanityAdapter({
        projectId: process.env.SANITY_PROJECT_ID,
        dataset: process.env.SANITY_DATASET ?? "production",
        token: process.env.SANITY_TOKEN ?? "",
      })
    : createInMemoryCmsAdapter();

  const cms = createCmsService({
    persistence: cmsPersistence,
    components: createComponentRegistry(),
  });

  // `checkout` structurally satisfies account's OrderLookup interface
  // (getOrder + listOrdersByCustomer) already -- no adapter object needed.
  const account = createAccountService({
    profiles: createInMemoryCustomerProfileRepository(),
    orders: checkout,
    events,
  });

  // `checkout` structurally satisfies inventory's OrderLookup interface too.
  // Registered before seeding so seeded SKUs get their catalog.sku.created
  // init-at-0 handler fired, then seed.ts sets real stock afterward.
  const inventory = createInMemoryInventoryAdapter();
  registerInventorySync({ events, inventory, orders: checkout });

  // internal-bi (subsystem 20) -- structural shims bridge checkout/catalog/
  // promotions' real service shapes onto internal-bi's own narrow
  // OrderMetricsSource/SkuMetricsSource/PromotionMetricsSource interfaces (see
  // packages/internal-bi/src/types.ts). registerBiEventLogSync is wired here,
  // same pattern as registerInventorySync above -- it only sees events fired
  // from this point forward, no backfill of pre-existing history (see
  // .pHive/epics/internal-bi-metrics/docs/design-discussion.md §3).
  const biEventLog = createInMemoryBiEventLogRepository();
  const bi = createDefaultBiAdapter({
    orders: {
      listOrders: () => checkout.listOrders(),
    },
    skus: {
      getSku: (id) => catalog.getSku(id),
      getProduct: (id) => catalog.getProduct(id),
    },
    promotions: {
      listPromotions: () => promotions.listPromotions(),
    },
    eventLog: biEventLog,
  });
  registerBiEventLogSync({ events, eventLog: biEventLog });

  const plugins = createPluginRegistry();
  const orderNotificationPlugin = createOrderNotificationPlugin();
  plugins.register(orderNotificationPlugin);
  await plugins.initAll({ events });

  const serviceAreas = createServiceAreaService({
    areas: createInMemoryServiceAreaRepository(),
    assignments: createInMemoryServiceAreaProductRepository(),
  });

  // DEMO_BRAND=northline switches the seed to epic 15b's public demo
  // (Northline Home Tech, a fictional smart-home installer) -- unset (or
  // any other value) keeps the existing default dragon-merch seed, zero
  // behavior change. See .pHive/epics/service-demo-theme-public/docs/brand-and-scope.md.
  if (process.env.DEMO_BRAND === "northline") {
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);
  } else {
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas, bundles, recommendations, advertising);
  }

  return {
    events,
    analytics,
    catalog,
    cart,
    checkout,
    marketingCatalog,
    search,
    theming,
    pdp,
    cms,
    account,
    inventory,
    serviceAreas,
    plugins,
    orderNotificationPlugin,
    promotions,
    bundles,
    recommendations,
    advertising,
    bi,
    adminAuth,
  };
}

/** Lazily builds the service graph once per server process and reuses it across requests. */
export function getServices(): Promise<Services> {
  if (!servicesPromise) {
    servicesPromise = buildServices();
  }
  return servicesPromise;
}
