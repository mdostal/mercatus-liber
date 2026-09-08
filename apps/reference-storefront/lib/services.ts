import { createAccountService, createInMemoryCustomerProfileRepository, type AccountService } from "@mercatus-liber/account";
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import {
  createNoopAdapter,
  createPostHogAdapter,
  registerAnalyticsSync,
  type AnalyticsAdapter,
} from "@mercatus-liber/analytics";
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
import { createInMemoryInventoryAdapter, registerInventorySync, type InventoryAdapter } from "@mercatus-liber/inventory";
import { createOrderNotificationPlugin, createPluginRegistry, type OrderNotificationPlugin, type PluginRegistry } from "@mercatus-liber/plugins";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
  type MarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { createStripeAdapter } from "@mercatus-liber/payments";
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

  const persistence = createSqliteAdapter(":memory:");
  const catalog = createCatalogService({ persistence, events });

  const cart = createCartService({
    repository: createInMemoryCartRepository(),
    skus: catalog,
    events,
  });

  const payments = createStripeAdapter({
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    events,
  });

  const checkout = createCheckoutOrdersService({
    repository: createInMemoryOrderRepository(),
    cart,
    payments,
    events,
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

  const cms = createCmsService({
    persistence: createInMemoryCmsAdapter(),
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
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas);
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
  };
}

/** Lazily builds the service graph once per server process and reuses it across requests. */
export function getServices(): Promise<Services> {
  if (!servicesPromise) {
    servicesPromise = buildServices();
  }
  return servicesPromise;
}
