/** Shared test wiring -- the catalog/marketing-catalog/cms combo every test file in this suite needs, kept in one place to avoid drift as more services get added. */
import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import {
  createCmsService,
  createComponentRegistry,
  createInMemoryMarketingPageMetaRepository,
  createInMemoryPageRepository,
  type CmsService,
} from "@mercatus-liber/cms";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
  type MarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";

export interface TestCatalogServices {
  events: EventBus;
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  cms: CmsService;
}

export function buildTestCatalogServices(events: EventBus = createInMemoryEventBus()): TestCatalogServices {
  const persistence = createSqliteAdapter(":memory:");
  const catalog = createCatalogService({ persistence, events });
  const marketingCatalog = createMarketingCatalogService({
    categories: createInMemoryCategoryRepository(),
    assignments: createInMemoryProductCategoryRepository(),
    attributes: catalog,
  });
  const cms = createCmsService({
    pages: createInMemoryPageRepository(),
    marketingMeta: createInMemoryMarketingPageMetaRepository(),
    components: createComponentRegistry(),
  });
  return { events, catalog, marketingCatalog, cms };
}
