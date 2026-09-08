import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCartService, createInMemoryCartRepository, type CartService } from "@mercatus-liber/cart";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import {
  createCmsService,
  createComponentRegistry,
  createInMemoryMarketingPageMetaRepository,
  createInMemoryPageRepository,
  type CmsService,
} from "@mercatus-liber/cms";
import {
  createCheckoutOrdersService,
  createInMemoryOrderRepository,
  type CheckoutOrdersService,
} from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
  type MarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import { createStripeAdapter } from "@mercatus-liber/payments";
import { createPdpService, type PdpService } from "@mercatus-liber/pdp";
import { createInMemoryIndex, registerCatalogSearchSync, type SearchIndexAdapter } from "@mercatus-liber/search";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import { seedCatalog } from "./seed";

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
  catalog: CatalogService;
  cart: CartService;
  checkout: CheckoutOrdersService;
  marketingCatalog: MarketingCatalogService;
  search: SearchIndexAdapter;
  theming: ThemingService;
  pdp: PdpService;
  cms: CmsService;
}

let servicesPromise: Promise<Services> | null = null;

async function buildServices(): Promise<Services> {
  const events = createInMemoryEventBus();

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
    pages: createInMemoryPageRepository(),
    marketingMeta: createInMemoryMarketingPageMetaRepository(),
    components: createComponentRegistry(),
  });

  await seedCatalog(catalog, marketingCatalog, cms);

  return { events, catalog, cart, checkout, marketingCatalog, search, theming, pdp, cms };
}

/** Lazily builds the service graph once per server process and reuses it across requests. */
export function getServices(): Promise<Services> {
  if (!servicesPromise) {
    servicesPromise = buildServices();
  }
  return servicesPromise;
}
