import Database from "better-sqlite3";
import { Pool } from "pg";
import {
  createSqliteAdapterFromDb,
  createSqliteCategoryRepository,
  createSqliteProductCategoryRepository,
  openSqliteDb,
} from "@mercatus-liber/adapter-sqlite";
import {
  createPostgresAdapter,
  createPostgresCatalogRepository,
  createPostgresCategoryRepository,
  createPostgresProductCatalogRepository,
  createPostgresProductCategoryRepository,
} from "@mercatus-liber/adapter-postgres";
import { createPostgresInventoryAdapter } from "@mercatus-liber/adapter-postgres-inventory";
import {
  createCatalogService,
  createInMemoryCatalogRepository,
  createInMemoryProductCatalogRepository,
} from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryInventoryAdapter } from "@mercatus-liber/inventory";
import { createMarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { ImportShopifyCatalogDeps } from "./write-catalog.js";

/**
 * Wires this tool's CLI to one of this repo's own REAL native persistence
 * backends -- the exact same construction `apps/reference-storefront/lib/
 * services.ts` uses for its own `catalog`/`marketingCatalog`/`inventory`
 * services, not a bespoke CLI-only persistence path. Only the two backends
 * `packages/create-store`'s own `AdapterChoice` offers a merchant at
 * store-creation time (`sqlite`, `postgres`) are wired here; `mongodb`/
 * `convex` are real, already-tested backends elsewhere in this repo
 * (services.ts wires both) but are not yet plumbed into this CLI's
 * `--target` flag -- a disclosed limitation (see this package's README),
 * not a silent gap. `importShopifyCatalog` itself is adapter-agnostic (it
 * only depends on the `CatalogService`/`MarketingCatalogService`/
 * `InventoryAdapter` interfaces), so wiring Mongo/Convex in here later is a
 * pure CLI-side addition, not a write-path change.
 *
 * Inventory for the `sqlite` target is in-memory, matching
 * services.ts's own `pgPool ? createPostgresInventoryAdapter(pgPool) :
 * createInMemoryInventoryAdapter()` branch exactly: this repo has no
 * SQLite-backed `InventoryAdapter` implementation anywhere today, so a
 * SQLite-targeted import's stock levels do not survive a process restart.
 * Disclosed in the README, not papered over.
 */

export type MigrationTarget =
  | { kind: "sqlite"; filePath: string }
  | { kind: "postgres"; connectionString: string };

export interface TargetPersistence extends ImportShopifyCatalogDeps {
  /** Releases the real underlying connection (DB file handle / pg pool). Always call this when done, success or failure. */
  close(): Promise<void>;
}

export async function createTargetPersistence(target: MigrationTarget): Promise<TargetPersistence> {
  if (target.kind === "sqlite") {
    const db: Database.Database = openSqliteDb(target.filePath);
    const persistence = createSqliteAdapterFromDb(db);
    const categories = createSqliteCategoryRepository(db);
    const productCategories = createSqliteProductCategoryRepository(db);

    const catalog = createCatalogService({
      persistence,
      events: createInMemoryEventBus(),
      catalogs: createInMemoryCatalogRepository(),
      productCatalogs: createInMemoryProductCatalogRepository(),
    });
    const marketingCatalog = createMarketingCatalogService({
      categories,
      assignments: productCategories,
      attributes: catalog,
    });
    const inventory = createInMemoryInventoryAdapter();

    return {
      catalog,
      marketingCatalog,
      inventory,
      close: async () => {
        db.close();
      },
    };
  }

  const pool = new Pool({ connectionString: target.connectionString });
  try {
    const persistence = await createPostgresAdapter(pool);
    const catalog = createCatalogService({
      persistence,
      events: createInMemoryEventBus(),
      catalogs: createPostgresCatalogRepository(pool),
      productCatalogs: createPostgresProductCatalogRepository(pool),
    });
    const marketingCatalog = createMarketingCatalogService({
      categories: createPostgresCategoryRepository(pool),
      assignments: createPostgresProductCategoryRepository(pool),
      attributes: catalog,
    });
    const inventory = await createPostgresInventoryAdapter(pool);

    return {
      catalog,
      marketingCatalog,
      inventory,
      close: async () => {
        await pool.end();
      },
    };
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }
}
