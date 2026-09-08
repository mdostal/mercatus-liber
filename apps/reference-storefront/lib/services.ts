import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCartService, createInMemoryCartRepository, type CartService } from "@mercatus-liber/cart";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import {
  createCheckoutOrdersService,
  createInMemoryOrderRepository,
  type CheckoutOrdersService,
} from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { createStripeAdapter } from "@mercatus-liber/payments";
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

  await seedCatalog(catalog);

  return { events, catalog, cart, checkout };
}

/** Lazily builds the service graph once per server process and reuses it across requests. */
export function getServices(): Promise<Services> {
  if (!servicesPromise) {
    servicesPromise = buildServices();
  }
  return servicesPromise;
}
