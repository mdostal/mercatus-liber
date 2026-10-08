import {
  createSqliteAdapterFromDb,
  createSqliteCategoryRepository,
  createSqliteProductCategoryRepository,
  openSqliteDb,
} from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryInventoryAdapter } from "@mercatus-liber/inventory";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import { createMarketingCatalogService, type MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type Database from "better-sqlite3";
import type { ImportShopifyCatalogDeps } from "../src/write-catalog.js";

/**
 * A REAL target persistence for this package's write-path tests -- a real,
 * in-process SQLite database (via @mercatus-liber/adapter-sqlite, the same
 * reference adapter apps/reference-storefront wires up for real deployments
 * and the same one @mercatus-liber/catalog's own test suite uses), wired
 * through the exact same CatalogService/MarketingCatalogService/
 * InventoryAdapter construction this app uses everywhere else. No bespoke
 * fake persistence layer -- these tests exercise the real service layer
 * against a real (if ephemeral) database, same as the rest of this repo's
 * tests do.
 */
export interface TestPersistence extends ImportShopifyCatalogDeps {
  db: Database.Database;
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  inventory: InventoryAdapter;
}

export function createTestPersistence(): TestPersistence {
  const db = openSqliteDb(":memory:");
  const catalogPersistence = createSqliteAdapterFromDb(db);
  const categories = createSqliteCategoryRepository(db);
  const productCategories = createSqliteProductCategoryRepository(db);

  const catalog = createCatalogService({
    persistence: catalogPersistence,
    events: createInMemoryEventBus(),
    catalogs: {
      // This test harness never exercises the separate, named Catalog
      // entity (CatalogService.createCatalog/assignProductToCatalog) --
      // write-catalog.ts never calls those either, only
      // MarketingCatalogService's category/assignment methods. A minimal
      // in-memory stand-in keeps this file from also having to wire
      // @mercatus-liber/catalog's own createInMemoryCatalogRepository.
      async get() {
        return null;
      },
      async getBySlug() {
        return null;
      },
      async list() {
        return [];
      },
      async save() {},
    },
    productCatalogs: {
      async listCatalogIdsForProduct() {
        return [];
      },
      async listProductIdsInCatalog() {
        return [];
      },
      async assign() {},
      async unassign() {},
    },
  });

  const marketingCatalog = createMarketingCatalogService({
    categories,
    assignments: productCategories,
    attributes: catalog,
  });

  const inventory = createInMemoryInventoryAdapter();

  return { db, catalog, marketingCatalog, inventory };
}

/** A snapshot of every row this test cares about, for a real before/after equality check -- not just "no error was thrown". */
export interface PersistenceSnapshot {
  products: unknown[];
  skus: unknown[];
  categories: unknown[];
  stockBySku: Record<string, unknown>;
}

export async function snapshotPersistence(target: TestPersistence, allSkuIdsHint: string[] = []): Promise<PersistenceSnapshot> {
  const products = await target.catalog.listProducts();
  const skus = (await Promise.all(products.map((p) => target.catalog.listSkusByProduct(p.id)))).flat();
  const categories = await target.marketingCatalog.listCategories();
  const skuIds = new Set([...skus.map((s) => s.id), ...allSkuIdsHint]);
  const stockBySku: Record<string, unknown> = {};
  for (const id of skuIds) {
    stockBySku[id] = await target.inventory.getStock(id);
  }
  return { products, skus, categories, stockBySku };
}
