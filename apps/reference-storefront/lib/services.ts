import { cookies } from "next/headers";
import { createAccountService, createInMemoryCustomerProfileRepository, type AccountService } from "@mercatus-liber/account";
import { createClerkAdminAuthAdapter } from "@mercatus-liber/adapter-clerk";
import { createPostgresAdapter } from "@mercatus-liber/adapter-postgres";
import { createPrintfulFulfillmentAdapter, PRINTFUL_PROVIDER } from "@mercatus-liber/adapter-printful";
import { createPrintifyFulfillmentAdapter, PRINTIFY_PROVIDER } from "@mercatus-liber/adapter-printify";
import { createSanityAdapter } from "@mercatus-liber/adapter-sanity";
import { createCloudinaryFetchAdapter } from "@mercatus-liber/adapter-cloudinary";
import { createShippoShippingAdapter } from "@mercatus-liber/adapter-shippo";
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { ADMIN_DEV_SESSION_COOKIE, createDefaultAdminAuthAdapter, type AdminAuthAdapter } from "@mercatus-liber/admin-auth";
import {
  createAdvertisingService,
  createInMemoryCampaignRepository,
  type AdvertisingService,
} from "@mercatus-liber/advertising";
import {
  createGa4InsightsAdapter,
  createNoopAdapter,
  createNoopInsightsAdapter,
  createPostHogAdapter,
  createPostHogInsightsAdapter,
  registerAnalyticsSync,
  type AnalyticsAdapter,
  type AnalyticsInsightsAdapter,
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
  createFulfillmentService,
  createInMemoryFulfillmentRoutingRepository,
  createManualFulfillmentAdapter,
  MANUAL_FULFILLMENT_PROVIDER,
  type FulfillmentAdapter,
  type FulfillmentRoutingRepository,
  type FulfillmentService,
} from "@mercatus-liber/fulfillment";
import {
  createDefaultBiAdapter,
  createInMemoryBiEventLogRepository,
  registerBiEventLogSync,
  type BiMetricsAdapter,
} from "@mercatus-liber/internal-bi";
import { createInMemoryInventoryAdapter, registerInventorySync, type InventoryAdapter } from "@mercatus-liber/inventory";
import { createOrderNotificationPlugin, createPluginRegistry, type OrderNotificationPlugin, type PluginRegistry } from "@mercatus-liber/plugins";
import { createInMemoryPromotionRepository, createPromotionsService, type PromotionsService } from "@mercatus-liber/promotions";
import { createInMemoryReviewRepository, createReviewsService, type ReviewsService } from "@mercatus-liber/reviews";
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
import { createSandboxPaymentAdapter, createStripeAdapter, type PaymentAdapter } from "@mercatus-liber/payments";
import { createPdpService, type PdpService } from "@mercatus-liber/pdp";
import { createInMemoryIndex, registerCatalogSearchSync, type SearchIndexAdapter } from "@mercatus-liber/search";
import {
  createInMemoryServiceAreaProductRepository,
  createInMemoryServiceAreaRepository,
  createServiceAreaService,
  type ServiceAreaService,
} from "@mercatus-liber/service-areas";
import { createManualShippingAdapter, type ShippingAdapter } from "@mercatus-liber/shipping";
import { createPassthroughImageAdapter, type ImageAdapter } from "@mercatus-liber/media";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import { Pool } from "pg";
import { DEMO_REGISTRY, isDemoSlug, type DemoSlug } from "./demos";

/**
 * THE ONLY MODULE IN THIS REPO that imports concrete adapter implementations
 * (adapter-sqlite, the Stripe payment adapter). Every subsystem package
 * (catalog/cart/payments/checkout-orders) only ever depends on
 * @mercatus-liber/core plus narrow structural interfaces -- this module is
 * where a real deployment chooses and wires concrete implementations together.
 * See docs/ARCHITECTURE.md's prime directive and cf-07's acceptance criteria.
 *
 * Catalog persistence is env-var-selectable (see the `persistence` branch in
 * buildServices below and lib/adapter-info.ts's Persistence row):
 * `DATABASE_URL` -> Postgres, else `SQLITE_FILE_PATH` -> file-backed SQLite,
 * else the original in-memory SQLite default. Cart/order/promotion/etc.
 * repositories remain in-memory regardless -- this app's documented purpose
 * is still a proof of integration/demo, not a persistent production
 * storefront (see this package's own README and package.json description);
 * durable catalog data is the one piece worth surviving a restart for a
 * real demo/operator, per
 * .pHive/epics/data-backup-restore-and-adapter-portability/docs/design-discussion.md.
 */
/**
 * One configured (or configurable) read-side insights source for the admin
 * "Traffic & Sources" surface (analytics-insights-02). `configured` is a
 * distinct signal from whatever `adapter` actually returns -- the noop
 * adapter also resolves every method with a real empty array, so without
 * this flag the admin page couldn't tell "this provider isn't set up" apart
 * from "this provider is set up and genuinely has zero traffic in range".
 * See design-discussion.md §1c: every configured source is rendered
 * side by side, explicitly labeled, never merged/summed.
 */
export interface InsightsSource {
  /** Matches the `provider` value every row from this adapter carries (AnalyticsInsightsAdapter's ProviderAttributed). */
  provider: string;
  /** Human-readable label for the admin UI, e.g. "PostHog", "Google Analytics (GA4)". */
  label: string;
  configured: boolean;
  adapter: AnalyticsInsightsAdapter;
}

export interface Services {
  events: EventBus;
  analytics: AnalyticsAdapter;
  insightsSources: InsightsSource[];
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
  reviews: ReviewsService;
  bundles: BundlesService;
  recommendations: RecommendationsService;
  advertising: AdvertisingService;
  bi: BiMetricsAdapter;
  adminAuth: AdminAuthAdapter;
  fulfillment: FulfillmentService;
  /**
   * Exposed alongside `fulfillment` (not just wrapped inside it) so the
   * admin fulfillment surface can show a line's routed provider (defaulting
   * to "manual" -- see FulfillmentRoutingRepository) even before any
   * FulfillmentLineRecord exists for it -- FulfillmentService itself only
   * ever reports routing indirectly, via records an adapter has already
   * created (listForOrder/submitOrder), see packages/fulfillment/src/
   * service.ts.
   */
  fulfillmentRouting: FulfillmentRoutingRepository;
  /**
   * Non-null only when `payments` was built as a sandbox adapter (see
   * `buildServices`'s payments branch below, sandbox-checkout epic) --
   * `/demo/[demoSlug]/checkout/sandbox`'s own server action calls this
   * directly once the shopper submits the sandbox "Pay" form, exactly the
   * role a verified Stripe webhook plays for `payments` in real-Stripe mode.
   * Null whenever a real STRIPE_SECRET_KEY is configured, since that sandbox
   * checkout page/route is never reached in that mode.
   */
  confirmSandboxPayment: ((sessionId: string) => Promise<void>) | null;
  /**
   * The physical shipping-transaction subsystem (@mercatus-liber/shipping,
   * epic shipping-rate-and-labels) -- distinct from `fulfillment` above
   * (which routes *who produces/ships* a line), this is *the shipping
   * transaction itself*: rate shopping, label purchase, tracking. Keyed by
   * provider, same additive "manual default always present, a real
   * provider's key present only when its env var is configured" shape as
   * `fulfillment`'s own `adapters` map (see the `shipping` build below) --
   * `"manual"` (createManualShippingAdapter, packages/shipping) is always
   * present; `"shippo"` is additionally present only when
   * `SHIPPO_API_TOKEN` is set. Not itself wrapped in a routing service (no
   * ShippingService/routing-repository equivalent of FulfillmentService
   * exists yet -- out of scope for this story, which only builds the real
   * Shippo adapter and its wiring); a caller picks the adapter it wants
   * directly from this map.
   */
  shipping: Record<string, ShippingAdapter>;
  /** image-cdn epic -- resolves a product's raw image `url` into a real deliverable URL, see @mercatus-liber/media's own doc comment. */
  media: ImageAdapter;
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
 * Bridges adapter-printify's own `resolveExternalOrderId(orderId)` config
 * callback (see @mercatus-liber/adapter-printify's index.ts doc comment for
 * why this adapter, unlike adapter-printful, needs one at all: Printify's
 * real, confirmed `GET /v1/shops/{shop_id}/orders/{order_id}.json` addresses
 * an order by PRINTIFY'S OWN id, with no confirmed external_id-based lookup
 * equivalent to Printful's `@external_id` trick). `FulfillmentService.
 * submitOrder` (packages/fulfillment/src/service.ts) returns each provider's
 * `FulfillmentLineRecord[]` to its caller but does not itself persist them
 * anywhere, so nothing else in this app's service graph already remembers
 * "our orderId -> Printify's own order id" -- this wrapper captures it at the
 * one point it's genuinely available (the adapter's own submitOrder return
 * value, which already carries `externalOrderId` on every record) into a
 * plain in-memory Map, then getOrderStatus's resolveExternalOrderId reads it
 * back. Best-effort and lost on restart, same as every other in-memory piece
 * of this reference app's own service graph (see this module's header
 * comment) -- a real deployment would persist this durably (e.g. alongside
 * real FulfillmentLineRecord storage) instead.
 */
function withPrintifyExternalOrderIdCapture(adapter: FulfillmentAdapter, externalOrderIdByOrderId: Map<string, string>): FulfillmentAdapter {
  return {
    ...adapter,
    async submitOrder(input) {
      const records = await adapter.submitOrder(input);
      const externalOrderId = records.find((record) => record.externalOrderId)?.externalOrderId;
      if (externalOrderId) externalOrderIdByOrderId.set(input.orderId, externalOrderId);
      return records;
    },
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

const servicesByDemo = new Map<DemoSlug, Promise<Services>>();

async function buildServices(demoSlug: DemoSlug): Promise<Services> {
  const events = createInMemoryEventBus();

  // PostHog by default when a key is configured; no-op otherwise -- same
  // documented "empty config -> harmless fallback" pattern as the Stripe
  // adapter's empty secretKey. Wired before seeding so demo/seed activity
  // is covered by the same event-bus subscription real requests get.
  const analytics: AnalyticsAdapter = process.env.POSTHOG_API_KEY
    ? createPostHogAdapter({ apiKey: process.env.POSTHOG_API_KEY, host: process.env.POSTHOG_HOST })
    : createNoopAdapter();
  registerAnalyticsSync({ events, analytics });

  // Read-side insights sources for /admin/metrics' "Traffic & Sources"
  // section (analytics-insights-02) -- same env-var-truthy-picks-the-real-
  // adapter-else-noop-fallback shape as every other branch in this function,
  // but each of these two is independently configurable (a demo can have
  // neither, either, or both switched on) and each `configured` flag is
  // tracked explicitly so the admin page can render an honest "not
  // configured" state instead of an empty-looking table -- see InsightsSource
  // above.
  //
  // PostHog: per posthog-insights-adapter.ts's own doc comment (researched,
  // not assumed, in story 1), the Query API requires a distinct **personal**
  // API key with query:read scope -- POSTHOG_PERSONAL_API_KEY is deliberately
  // a different env var from the write-side POSTHOG_API_KEY above, they are
  // not interchangeable credentials. POSTHOG_APP_HOST is likewise distinct
  // from the write-side POSTHOG_HOST (ingestion host): the Query API is
  // served from PostHog's **app** host (e.g. https://us.posthog.com), not
  // the ingestion host (e.g. https://us.i.posthog.com).
  const postHogInsightsConfigured = Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
  const postHogInsights: AnalyticsInsightsAdapter = postHogInsightsConfigured
    ? createPostHogInsightsAdapter({
        personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
        projectId: process.env.POSTHOG_PROJECT_ID!,
        host: process.env.POSTHOG_APP_HOST,
      })
    : createNoopInsightsAdapter();

  // GA4: a real credential gate (property ID + service-account key) per
  // ga4-insights-adapter.ts's own doc comment and this story's disclosure
  // requirement -- see this story's final report for whether a real
  // credential was available in this environment. GA4_PRIVATE_KEY holds the
  // service-account JSON key file's `private_key` field; env vars can't carry
  // real newlines reliably, so the conventional (Firebase Admin SDK, etc.)
  // escaped-`\n` encoding is unescaped here before use.
  const ga4InsightsConfigured = Boolean(
    process.env.GA4_PROPERTY_ID && process.env.GA4_SERVICE_ACCOUNT_EMAIL && process.env.GA4_PRIVATE_KEY,
  );
  const ga4Insights: AnalyticsInsightsAdapter = ga4InsightsConfigured
    ? createGa4InsightsAdapter({
        propertyId: process.env.GA4_PROPERTY_ID!,
        serviceAccountEmail: process.env.GA4_SERVICE_ACCOUNT_EMAIL!,
        privateKey: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      })
    : createNoopInsightsAdapter();

  const insightsSources: InsightsSource[] = [
    { provider: "posthog", label: "PostHog", configured: postHogInsightsConfigured, adapter: postHogInsights },
    { provider: "ga4", label: "Google Analytics (GA4)", configured: ga4InsightsConfigured, adapter: ga4Insights },
  ];

  // Real Clerk adapter when a real Clerk account is configured; the
  // zero-infra, local-development-only dev default otherwise -- same
  // two-branch "env var truthy picks the real adapter, else a harmless
  // local fallback" shape as the analytics branch above (see
  // admin-auth-03-route-and-mutation-gating.yaml). CLERK_SECRET_KEY is also
  // the single signal apps/reference-storefront/app/demo/[demoSlug]/layout.tsx
  // uses to decide whether to render <ClerkProvider/> at all (the
  // demo-agnostic app/(landing)/layout.tsx needs no Clerk UI at all, since
  // no admin route lives outside a demo) -- clerkMiddleware()/<ClerkProvider> both throw immediately when
  // Clerk isn't actually configured (confirmed by reading @clerk/nextjs's
  // own source), so every one of those call sites must agree on the same
  // "is Clerk configured" check.
  const adminAuth: AdminAuthAdapter = process.env.CLERK_SECRET_KEY
    ? createClerkAdminAuthAdapter()
    : createDevAdminAuthAdapter();

  // Real Postgres adapter when DATABASE_URL is configured; else real
  // file-backed SQLite when SQLITE_FILE_PATH is configured (DATABASE_URL
  // unset); else today's original in-memory SQLite default -- same
  // three/two-branch "env var truthy picks the real adapter, else a
  // harmless local fallback" shape as the CMS/admin-auth/analytics
  // branches above (see
  // .pHive/epics/data-backup-restore-and-adapter-portability/docs/design-discussion.md
  // §1a). Before this story there was no env branch here at all --
  // catalog data was unconditionally in-memory and lost on every restart.
  // createPostgresAdapter (packages/adapter-postgres) owns running its own
  // idempotent schema DDL against the pool; this module only constructs
  // the pg.Pool from DATABASE_URL, mirroring
  // packages/create-store/src/scaffold.ts's generated services.ts wiring
  // for the same adapter.
  const persistence = process.env.DATABASE_URL
    ? await createPostgresAdapter(new Pool({ connectionString: process.env.DATABASE_URL }))
    : process.env.SQLITE_FILE_PATH
      ? createSqliteAdapter(process.env.SQLITE_FILE_PATH)
      : createSqliteAdapter(":memory:");
  const catalog = createCatalogService({ persistence, events });

  const cart = createCartService({
    repository: createInMemoryCartRepository(),
    skus: catalog,
    events,
  });

  // Real Stripe when a real key is configured; a real, fully-working
  // no-external-provider sandbox adapter otherwise (sandbox-checkout epic)
  // -- unlike every other env-var-truthy branch in this function, the
  // "else" here is not a harmless-but-inert fallback: it's a second genuine
  // PaymentAdapter implementation that actually completes checkout, so
  // "practice card" orders always work in this deployment (no Stripe
  // account exists for it) without needing a credential. See
  // packages/payments/src/sandbox-adapter.ts's own doc comment for why this
  // is possible with zero changes to checkout-orders.
  const sandboxPayments = process.env.STRIPE_SECRET_KEY
    ? null
    : createSandboxPaymentAdapter({ events, checkoutPagePath: `/demo/${demoSlug}/checkout/sandbox` });
  const payments: PaymentAdapter =
    sandboxPayments ??
    createLazyStripeAdapter({
      secretKey: process.env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      events,
    });

  const promotions = createPromotionsService({
    repository: createInMemoryPromotionRepository(),
    events,
  });

  // bare-basics epic: product reviews/star ratings -- a real moderation
  // queue (submit -> pending -> admin publishes/rejects), never
  // auto-published. See @mercatus-liber/reviews's own doc comment.
  const reviews = createReviewsService({
    repository: createInMemoryReviewRepository(),
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

  // @mercatus-liber/fulfillment (subsystem 41/42, fulfillment-02 +
  // adapter-printful-02) -- the manual adapter is always registered as the
  // permanent self-fulfillment fallback (see createManualFulfillmentAdapter's
  // own doc comment). `PRINTFUL_API_TOKEN` set and truthy additionally
  // registers the real Printful adapter under its own provider key
  // ("printful") -- same two-state "env var truthy picks the real thing,
  // else nothing extra is registered" shape as every other optional adapter
  // in this file, except this one *adds* a provider rather than swapping one
  // (a SKU only actually routes to "printful" once
  // fulfillmentRouting.setProviderForSku is called for it -- every SKU still
  // defaults to "manual" either way, see FulfillmentRoutingRepository).
  //
  // createPrintfulFulfillmentAdapter's config requires two resolver
  // callbacks that bridge real gaps between this reference app's own data
  // model and Printful's real v2 order API (see packages/adapter-printful/
  // src/mapping.ts's doc comments and design-discussion.md for the full
  // research record):
  //   - resolveRecipient: checkout-orders' own ShippingInfo
  //     (packages/checkout-orders/src/types.ts) is only
  //     `{ name, email, address }` -- one free-text address line, because
  //     the only real payment adapter wired today (Stripe Checkout) collects
  //     and verifies its own address at Stripe's hosted page and never
  //     returns a structured one back to this app. Printful's real v2
  //     `recipient` schema wants structured address1/city/state_code/
  //     zip/country_code fields this app genuinely does not have, so this
  //     is a best-effort bridge (the whole free-text line into address1),
  //     not a fabricated structured address -- a real deployment would need
  //     to collect a structured address at checkout to do better.
  //   - resolveCatalogTarget: this reference app's catalog (@mercatus-liber/
  //     core's `Sku`, see packages/core/src/schema.ts) has no notion of a
  //     Printful `catalog_variant_id` at all -- SKUs here are this app's own
  //     internal marketplace identifiers, not Printful's catalog surface.
  //     No SKU -> Printful-catalog-variant mapping data source exists in
  //     this reference app, so this throws a clear, honest error instead of
  //     inventing one; a real deployment would add that mapping (e.g. a
  //     small config table or a SKU metadata field) before routing any SKU
  //     to "printful" via fulfillmentRouting.setProviderForSku.
  //
  // No real Printful account/API token exists in this environment -- see
  // this story's final report and docs/subsystems/22-fulfillment.md's
  // Printful section for the honest disclosure. This branch is therefore
  // unexercised against a live Printful API here; it's covered instead by
  // @mercatus-liber/adapter-printful's own unit test suite (prior story) plus
  // this file's env-var branch itself being independently verifiable with a
  // fake/test token for wiring purposes only.
  // Printify's own `resolveExternalOrderId` bridge (see
  // withPrintifyExternalOrderIdCapture's doc comment above) -- declared
  // outside the adapters map so both the wrapper and the config callback
  // below close over the same Map instance.
  const printifyExternalOrderIdByOrderId = new Map<string, string>();

  const fulfillmentRouting = createInMemoryFulfillmentRoutingRepository();
  const fulfillment = createFulfillmentService({
    orders: checkout,
    routing: fulfillmentRouting,
    adapters: {
      [MANUAL_FULFILLMENT_PROVIDER]: createManualFulfillmentAdapter(),
      ...(process.env.PRINTFUL_API_TOKEN
        ? {
            [PRINTFUL_PROVIDER]: createPrintfulFulfillmentAdapter({
              apiToken: process.env.PRINTFUL_API_TOKEN,
              ...(process.env.PRINTFUL_STORE_ID ? { storeId: process.env.PRINTFUL_STORE_ID } : {}),
              async resolveRecipient(orderId) {
                const order = await checkout.getOrder(orderId);
                if (!order) {
                  throw new Error(`resolveRecipient: no such order "${orderId}"`);
                }
                return {
                  name: order.shippingInfo.name,
                  email: order.shippingInfo.email,
                  address1: order.shippingInfo.address,
                };
              },
              async resolveCatalogTarget(skuId) {
                throw new Error(
                  `resolveCatalogTarget: no Printful catalog_variant_id mapping exists for SKU "${skuId}" -- ` +
                    "this reference app's catalog has no notion of Printful's catalog surface; a real " +
                    "deployment needs an explicit SKU -> Printful catalog_variant_id mapping before routing " +
                    "any SKU to the \"printful\" provider.",
                );
              },
            }),
          }
        : {}),
      // `PRINTIFY_API_TOKEN` and `PRINTIFY_SHOP_ID` both required and truthy
      // (unlike Printful's single-token gate) -- real Printify accounts can
      // have multiple shops with no auto-discovery endpoint (adapter-printify's
      // own PrintifyFulfillmentAdapterConfig doc comment, design-discussion.md
      // §1b), so a shop id genuinely has to be supplied, not guessed. Additive,
      // same two-state "env var truthy adds a provider, rather than swapping
      // one" shape as the Printful branch immediately above -- both can be
      // registered side by side, and a SKU only actually routes to
      // `"printify"` once fulfillmentRouting.setProviderForSku is called for
      // it (every SKU still defaults to "manual" either way).
      //
      // createPrintifyFulfillmentAdapter's config requires three resolver
      // callbacks bridging real gaps between this reference app's own data
      // model and Printify's real v1 order API (see packages/adapter-printify/
      // src/index.ts and src/mapping.ts's doc comments, and this epic's
      // design-discussion.md for the full research record):
      //   - resolveRecipient: same real gap as Printful's resolveRecipient
      //     above -- checkout-orders' ShippingInfo carries only one free-text
      //     address line, but Printify's real address_to schema wants
      //     structured first_name/last_name/address1/city/zip/country fields.
      //     This is a best-effort bridge (the whole free-text name into
      //     first_name, leaving last_name unset, and the whole free-text
      //     address line into address1), not a fabricated structured name/
      //     address -- a real deployment would need to collect structured
      //     shipping info at checkout to do better.
      //   - resolveCatalogTarget: same real gap as Printful's
      //     resolveCatalogTarget above -- this reference app's catalog has no
      //     notion of a Printify product_id/variant_id at all, so this throws
      //     a clear, honest error instead of inventing one; a real deployment
      //     would add that mapping (e.g. a small config table or a SKU
      //     metadata field) before routing any SKU to "printify".
      //   - resolveExternalOrderId: Printify-specific bridge (Printful needs
      //     no equivalent) -- see withPrintifyExternalOrderIdCapture's own doc
      //     comment above for why.
      //
      // No real Printify account/API token exists in this environment -- see
      // this story's final report and docs/subsystems/22-fulfillment.md's
      // Printify section for the honest disclosure. This branch is therefore
      // unexercised against a live Printify API here; it's covered instead by
      // @mercatus-liber/adapter-printify's own unit test suite (prior story)
      // plus this file's env-var branch itself being independently verifiable
      // with fake/test credentials for wiring purposes only.
      ...(process.env.PRINTIFY_API_TOKEN && process.env.PRINTIFY_SHOP_ID
        ? {
            [PRINTIFY_PROVIDER]: withPrintifyExternalOrderIdCapture(
              createPrintifyFulfillmentAdapter({
                apiToken: process.env.PRINTIFY_API_TOKEN,
                shopId: process.env.PRINTIFY_SHOP_ID,
                async resolveRecipient(orderId) {
                  const order = await checkout.getOrder(orderId);
                  if (!order) {
                    throw new Error(`resolveRecipient: no such order "${orderId}"`);
                  }
                  return {
                    first_name: order.shippingInfo.name,
                    email: order.shippingInfo.email,
                    address1: order.shippingInfo.address,
                  };
                },
                async resolveCatalogTarget(skuId) {
                  throw new Error(
                    `resolveCatalogTarget: no Printify product/variant mapping exists for SKU "${skuId}" -- ` +
                      "this reference app's catalog has no notion of Printify's catalog surface; a real " +
                      "deployment needs an explicit SKU -> Printify product_id/variant_id mapping before " +
                      "routing any SKU to the \"printify\" provider.",
                  );
                },
                async resolveExternalOrderId(orderId) {
                  return printifyExternalOrderIdByOrderId.get(orderId) ?? null;
                },
              }),
              printifyExternalOrderIdByOrderId,
            ),
          }
        : {}),
    },
  });

  // @mercatus-liber/shipping (subsystem shipping-rate-and-labels, stories
  // shipping-01 + shipping-02) -- the manual/PirateShip default is always
  // registered under `"manual"` (see createManualShippingAdapter's own doc
  // comment: PirateShip has no public API, confirmed by research, so this is
  // a genuine documented-manual-workflow, never fabricated rate/label data).
  // `SHIPPO_API_TOKEN` set and truthy additionally registers the real Shippo
  // adapter under `"shippo"` -- same two-state "env var truthy adds a
  // provider, rather than swapping one" shape as the Printful/Printify
  // branches above (this epic's own design discussion explicitly names that
  // pattern as the one to mirror). No live Shippo account/token exists in
  // this environment -- see this story's final report and
  // @mercatus-liber/adapter-shippo's own unit test suite (prior to this
  // wiring) for the real correctness proof against Shippo's actual, current
  // API shape; this branch is unexercised against a live Shippo API here.
  const shipping: Record<string, ShippingAdapter> = {
    manual: createManualShippingAdapter(),
    ...(process.env.SHIPPO_API_TOKEN
      ? { shippo: createShippoShippingAdapter({ apiToken: process.env.SHIPPO_API_TOKEN }) }
      : {}),
  };

  // @mercatus-liber/media (image-cdn epic) -- createPassthroughImageAdapter()
  // (serves whatever URL a product's images carry, unchanged) is always the
  // default; CLOUDINARY_CLOUD_NAME set and truthy additionally swaps in the
  // real Cloudinary-fetch-mode adapter, same "env var truthy picks the real
  // adapter, else a harmless functional default" shape as every other
  // subsystem in this function. Fetch mode needs only a cloud name (no API
  // key/secret), so this works against any free Cloudinary account.
  const media: ImageAdapter = process.env.CLOUDINARY_CLOUD_NAME
    ? createCloudinaryFetchAdapter({ cloudName: process.env.CLOUDINARY_CLOUD_NAME })
    : createPassthroughImageAdapter();

  const plugins = createPluginRegistry();
  const orderNotificationPlugin = createOrderNotificationPlugin();
  plugins.register(orderNotificationPlugin);
  await plugins.initAll({ events });

  const serviceAreas = createServiceAreaService({
    areas: createInMemoryServiceAreaRepository(),
    assignments: createInMemoryServiceAreaProductRepository(),
  });

  // demoSlug picks the seed via the lib/demos.ts registry -- replaces the
  // old DEMO_BRAND env var (see design-discussion.md §3). isDemoSlug's
  // guard in getServicesForDemo below guarantees demoSlug is a known key
  // here, so this lookup can't silently miss.
  await DEMO_REGISTRY[demoSlug].seed({
    catalog,
    marketingCatalog,
    cms,
    inventory,
    serviceAreas,
    bundles,
    recommendations,
    advertising,
    promotions,
    reviews,
  });

  return {
    events,
    analytics,
    insightsSources,
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
    reviews,
    bundles,
    recommendations,
    advertising,
    bi,
    adminAuth,
    fulfillment,
    fulfillmentRouting,
    shipping,
    media,
    confirmSandboxPayment: sandboxPayments ? sandboxPayments.confirmSandboxPayment.bind(sandboxPayments) : null,
  };
}

/**
 * Lazily builds one, genuinely isolated service graph per demo (separate
 * carts, orders, promotions, everything -- see design-discussion.md §2 on
 * why the whole graph, not just seed data, must be duplicated per demo) and
 * reuses it across requests for that same demo. Throws a clear error for an
 * unknown demo slug rather than silently building an empty/wrong service
 * graph -- callers should validate with `isDemoSlug` first when the slug
 * comes from an untrusted source (e.g. a URL route param).
 */
export function getServicesForDemo(demoSlug: DemoSlug): Promise<Services> {
  if (!isDemoSlug(demoSlug)) {
    throw new Error(`getServicesForDemo: unknown demo slug ${JSON.stringify(demoSlug)}`);
  }
  let promise = servicesByDemo.get(demoSlug);
  if (!promise) {
    promise = buildServices(demoSlug);
    servicesByDemo.set(demoSlug, promise);
  }
  return promise;
}
