import { randomUUID } from "node:crypto";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { PromotionsService } from "@mercatus-liber/promotions";
import { createStoreApiHandler, type StoreApiDeps, type StoreApiKey, type StoreApiKeyRepository, type StoreApiPromotion } from "@mercatus-liber/store-api";
import { generateWebhookSecret, type WebhookSubscription, type WebhookSubscriptionStore } from "@mercatus-liber/webhooks";
import { canonicalUrl } from "./site-url";

/**
 * Webhook subscriptions live in one table shared by every demo store, so each
 * demo only sees and delivers to its own: its subscriptions' ids start with
 * `${demoSlug}.`. Without this, a subscriber to one demo would receive another
 * demo's product events.
 */
export function scopeWebhookSubscriptions(base: WebhookSubscriptionStore, demoSlug: string): WebhookSubscriptionStore {
  const prefix = `${demoSlug}.`;
  const ours = (s: WebhookSubscription | null): WebhookSubscription | null => (s && s.id.startsWith(prefix) ? s : null);
  return {
    get: async (id) => ours(await base.get(id)),
    list: async (filter) => (await base.list(filter)).filter((s) => s.id.startsWith(prefix)),
    save: async (subscription) => {
      if (!subscription.id.startsWith(prefix)) throw new Error(`Subscription ${subscription.id} doesn't belong to ${demoSlug}`);
      await base.save(subscription);
    },
    delete: async (id) => {
      if (id.startsWith(prefix)) await base.delete(id);
    },
  };
}

/**
 * API keys live in one table shared by every demo store on the same database,
 * so each demo only accepts and lists its own: a key's stored id starts with
 * `${demoSlug}.`. Without this, a key created in one demo's admin would
 * authenticate against every other demo's store API. A key saved before this
 * scoping existed has no prefix and is accepted by no store.
 */
export function scopeStoreApiKeys(base: StoreApiKeyRepository, demoSlug: string): StoreApiKeyRepository {
  const prefix = `${demoSlug}.`;
  const ours = (key: StoreApiKey | null): StoreApiKey | null => (key && key.id.startsWith(prefix) ? key : null);
  return {
    get: async (id) => ours(await base.get(id)),
    getByPrefix: async (keyPrefix) => ours(await base.getByPrefix(keyPrefix)),
    list: async () => (await base.list()).filter((key) => key.id.startsWith(prefix)),
    save: (key) => base.save(key.id.startsWith(prefix) ? key : { ...key, id: `${prefix}${key.id}` }),
  };
}

/**
 * The products of one store only. `CatalogService.listProducts()` and
 * `getProduct()` aren't scoped to a store, so on a database several demos
 * share they'd hand an outside app every demo's products. A store's own
 * products are the ones assigned to its catalog (see `listProductsForDemo`).
 */
export function scopeCatalogToStore(catalog: CatalogService, catalogSlug: string): StoreApiDeps["catalog"] {
  const ours = async (): Promise<Awaited<ReturnType<CatalogService["listProducts"]>>> => {
    const storeCatalog = await catalog.getCatalogBySlug(catalogSlug);
    return storeCatalog ? catalog.listProductsInCatalog(storeCatalog.id) : [];
  };
  return {
    listProducts: async (filter) => {
      const products = await ours();
      return filter?.status ? products.filter((product) => product.status === filter.status) : products;
    },
    getProduct: async (id) => (await ours()).find((product) => product.id === id) ?? null,
    listSkusByProduct: (productId) => catalog.listSkusByProduct(productId),
  };
}

const toApiPromotion = ({ demoSlug: _demoSlug, ...promotion }: StoreApiPromotion & { demoSlug?: string }): StoreApiPromotion => promotion;

/** The store API for one demo store, mounted at /api/store/v1/<demoSlug>. */
export function buildStoreApi(input: {
  demoSlug: string;
  displayName: string;
  /** Slug of the catalog this store's products are assigned to. */
  catalogSlug: string;
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  promotions: PromotionsService;
  webhookSubscriptions: WebhookSubscriptionStore;
  keys: StoreApiKeyRepository;
}): (request: Request) => Promise<Response> {
  const { demoSlug, marketingCatalog, promotions, webhookSubscriptions } = input;
  const catalog = scopeCatalogToStore(input.catalog, input.catalogSlug);
  const storeUrl = canonicalUrl(`/demo/${demoSlug}`);
  return createStoreApiHandler({
    keys: input.keys,
    basePath: `/api/store/v1/${demoSlug}`,
    deps: {
      store: { name: input.displayName, currency: "USD", url: storeUrl },
      catalog,
      categories: {
        listCategories: () => marketingCatalog.listCategories({ demoSlug }),
        listCategoriesForProduct: (productId) => marketingCatalog.listCategoriesForProduct(productId),
      },
      promotions: {
        listPromotions: async () => (await promotions.listPromotions({ demoSlug })).map(toApiPromotion),
        getPromotion: async (id) => {
          const found = await promotions.getPromotion(id);
          return found && found.demoSlug === demoSlug ? toApiPromotion(found) : null;
        },
        createPromotion: async (promotion) => toApiPromotion(await promotions.createPromotion({ ...promotion, demoSlug })),
        updatePromotion: async (id, patch) => {
          const updated = await promotions.updatePromotion(id, patch);
          return updated ? toApiPromotion(updated) : null;
        },
      },
      webhooks: {
        async create({ url, eventTypes }) {
          const subscription: WebhookSubscription = { id: `${demoSlug}.${randomUUID()}`, url, eventTypes, secret: generateWebhookSecret(), active: true, createdAt: new Date().toISOString() };
          await webhookSubscriptions.save(subscription);
          return subscription;
        },
        list: () => webhookSubscriptions.list(),
        delete: (id) => webhookSubscriptions.delete(id),
      },
    },
  });
}
