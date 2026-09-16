/** Shared test wiring -- the catalog/marketing-catalog/cms/inventory combo every test file in this suite needs, kept in one place to avoid drift as more services get added. */
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import {
  createCatalogService,
  createInMemoryCatalogRepository,
  createInMemoryProductCatalogRepository,
  type CatalogService,
} from "@mercatus-liber/catalog";
import {
  createCmsService,
  createComponentRegistry,
  createInMemoryCmsAdapter,
  type CmsService,
} from "@mercatus-liber/cms";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { createInMemoryInventoryAdapter, registerInventorySync, type InventoryAdapter, type OrderLookup } from "@mercatus-liber/inventory";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
  type MarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";
import {
  createInMemoryServiceAreaProductRepository,
  createInMemoryServiceAreaRepository,
  createServiceAreaService,
  type ServiceAreaService,
} from "@mercatus-liber/service-areas";

export interface TestCatalogServices {
  events: EventBus;
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  cms: CmsService;
  inventory: InventoryAdapter;
  serviceAreas: ServiceAreaService;
}

/**
 * `orders` defaults to a no-op OrderLookup (returns null) -- fine for tests
 * that only seed/browse and never exercise a real checkout; pass a real
 * checkout-orders instance (which structurally satisfies OrderLookup) when a
 * test needs reserve/commit/release to actually fire.
 */
export function buildTestCatalogServices(
  events: EventBus = createInMemoryEventBus(),
  orders: OrderLookup = { getOrder: async () => null },
): TestCatalogServices {
  const persistence = createSqliteAdapter(":memory:");
  const catalog = createCatalogService({
    persistence,
    events,
    catalogs: createInMemoryCatalogRepository(),
    productCatalogs: createInMemoryProductCatalogRepository(),
  });
  const marketingCatalog = createMarketingCatalogService({
    categories: createInMemoryCategoryRepository(),
    assignments: createInMemoryProductCategoryRepository(),
    attributes: catalog,
  });
  const cms = createCmsService({
    persistence: createInMemoryCmsAdapter(),
    components: createComponentRegistry(),
  });
  const inventory = createInMemoryInventoryAdapter();
  registerInventorySync({ events, inventory, orders });
  const serviceAreas = createServiceAreaService({
    areas: createInMemoryServiceAreaRepository(),
    assignments: createInMemoryServiceAreaProductRepository(),
  });
  return { events, catalog, marketingCatalog, cms, inventory, serviceAreas };
}
