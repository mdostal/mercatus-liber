/**
 * backup-restore-01: covers the persistence env-var wiring acceptance
 * criteria in .pHive/epics/data-backup-restore-and-adapter-portability/
 * stories/backup-restore-01-persistence-wiring-and-backup-restore.yaml for
 * lib/services.ts's `persistence` branch, plus (ims-postgres-alternate
 * epic) its sibling `inventory` branch, which shares the same DATABASE_URL/
 * pg.Pool. Same "mock the concrete adapter, keep everything downstream
 * real" shape as cms-persistence-wiring.test.ts's Sanity mock: no real
 * reachable Postgres/Mongo/Convex instance is assumed here, so every
 * concrete adapter constructor is mocked to record what it's called with
 * and return a real, working in-memory-backed adapter under the hood, so
 * the rest of buildServices() (which seeds real catalog data during
 * construction) runs completely unmodified. pg's `Pool` and mongodb's
 * `MongoClient` constructors are mocked too, purely to capture the
 * connection config passed to them without needing a real network-capable
 * client -- neither is actually exercised, just recorded.
 *
 * per-demo-backend-diversity epic: also covers categoryRepository/
 * productCategoryRepository resolving to the SAME backend as `persistence`
 * (marketing-catalog data genuinely lives in whichever real database this
 * demo resolved, not a separate in-memory set) and the per-demo env-var
 * override tier (resolveDemoPersistenceEnv) taking priority over the global
 * chain, all-or-nothing per demo.
 *
 * The real, reachable-Postgres path is separately verified (not mocked) in
 * test/persistence-postgres-live.test.ts, which is skipped unless a real
 * Postgres instance is actually reachable in this environment -- see that
 * file's header for exactly what it proves and how to run it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const createPostgresAdapterMock = vi.fn();
const createPostgresCategoryRepositoryMock = vi.fn();
const createPostgresProductCategoryRepositoryMock = vi.fn();
const createPostgresInventoryAdapterMock = vi.fn();
const poolConfigs: unknown[] = [];
const mongoClientConfigs: unknown[] = [];

// full-commerce-persistence-audit epic: one recorder mock per newly-wired
// Postgres-backed repository (13 subsystems + the 2 new Catalog-entity
// repositories), same "record what pool it's called with" shape as
// createPostgresCategoryRepositoryMock/createPostgresProductCategoryRepositoryMock
// above -- lets the new test cases below assert both that DATABASE_URL wires
// every one of them to the SAME shared pool, and that omitting DATABASE_URL
// leaves every one of them uncalled (in-memory fallback instead).
const createPostgresCatalogRepositoryMock = vi.fn();
const createPostgresProductCatalogRepositoryMock = vi.fn();
const createPostgresCartRepositoryMock = vi.fn();
const createPostgresOrderRepositoryMock = vi.fn();
const createPostgresCustomerProfileRepositoryMock = vi.fn();
const createPostgresPromotionRepositoryMock = vi.fn();
const createPostgresReviewRepositoryMock = vi.fn();
const createPostgresStorefrontViewRepositoryMock = vi.fn();
const createPostgresBundleRepositoryMock = vi.fn();
const createPostgresRecommendationRepositoryMock = vi.fn();
const createPostgresCampaignRepositoryMock = vi.fn();
const createPostgresServiceAreaRepositoryMock = vi.fn();
const createPostgresServiceAreaProductRepositoryMock = vi.fn();
const createPostgresBiEventLogRepositoryMock = vi.fn();
const createPostgresFulfillmentRoutingRepositoryMock = vi.fn();

vi.mock("@mercatus-liber/adapter-postgres", async () => {
  const { createSqliteAdapter } = await import("@mercatus-liber/adapter-sqlite");
  const { createInMemoryCategoryRepository, createInMemoryProductCategoryRepository } = await import(
    "@mercatus-liber/marketing-catalog"
  );
  // full-commerce-persistence-audit epic: this test file only exercises
  // backend-SELECTION logic (which real function gets called for which
  // demo), never repository correctness -- each of the 13 new subsystems
  // below already has its own dedicated, real-database-verified test suite
  // in packages/adapter-postgres/test/. These mocks are plain passthroughs
  // to each subsystem's own real in-memory reference implementation, same
  // "record what it's called with, return a real working adapter under the
  // hood" shape as the two pre-existing category mocks above.
  const { createInMemoryCatalogRepository, createInMemoryProductCatalogRepository } = await import(
    "@mercatus-liber/catalog"
  );
  const { createInMemoryCartRepository } = await import("@mercatus-liber/cart");
  const { createInMemoryOrderRepository } = await import("@mercatus-liber/checkout-orders");
  const { createInMemoryCustomerProfileRepository } = await import("@mercatus-liber/account");
  const { createInMemoryPromotionRepository } = await import("@mercatus-liber/promotions");
  const { createInMemoryReviewRepository } = await import("@mercatus-liber/reviews");
  const { createInMemoryStorefrontViewRepository } = await import("@mercatus-liber/storefront-views");
  const { createInMemoryBundleRepository } = await import("@mercatus-liber/bundles");
  const { createInMemoryRecommendationRepository } = await import("@mercatus-liber/recommendations");
  const { createInMemoryCampaignRepository } = await import("@mercatus-liber/advertising");
  const { createInMemoryServiceAreaRepository, createInMemoryServiceAreaProductRepository } = await import(
    "@mercatus-liber/service-areas"
  );
  const { createInMemoryBiEventLogRepository } = await import("@mercatus-liber/internal-bi");
  const { createInMemoryFulfillmentRoutingRepository } = await import("@mercatus-liber/fulfillment");
  return {
    createPostgresAdapter: async (pool: unknown) => {
      createPostgresAdapterMock(pool);
      return createSqliteAdapter(":memory:");
    },
    createPostgresCategoryRepository: (pool: unknown) => {
      createPostgresCategoryRepositoryMock(pool);
      return createInMemoryCategoryRepository();
    },
    createPostgresProductCategoryRepository: (pool: unknown) => {
      createPostgresProductCategoryRepositoryMock(pool);
      return createInMemoryProductCategoryRepository();
    },
    createPostgresCatalogRepository: (pool: unknown) => {
      createPostgresCatalogRepositoryMock(pool);
      return createInMemoryCatalogRepository();
    },
    createPostgresProductCatalogRepository: (pool: unknown) => {
      createPostgresProductCatalogRepositoryMock(pool);
      return createInMemoryProductCatalogRepository();
    },
    createPostgresCartRepository: (pool: unknown) => {
      createPostgresCartRepositoryMock(pool);
      return createInMemoryCartRepository();
    },
    createPostgresOrderRepository: (pool: unknown) => {
      createPostgresOrderRepositoryMock(pool);
      return createInMemoryOrderRepository();
    },
    createPostgresCustomerProfileRepository: (pool: unknown) => {
      createPostgresCustomerProfileRepositoryMock(pool);
      return createInMemoryCustomerProfileRepository();
    },
    createPostgresPromotionRepository: (pool: unknown) => {
      createPostgresPromotionRepositoryMock(pool);
      return createInMemoryPromotionRepository();
    },
    createPostgresReviewRepository: (pool: unknown) => {
      createPostgresReviewRepositoryMock(pool);
      return createInMemoryReviewRepository();
    },
    createPostgresStorefrontViewRepository: (pool: unknown) => {
      createPostgresStorefrontViewRepositoryMock(pool);
      return createInMemoryStorefrontViewRepository();
    },
    createPostgresBundleRepository: (pool: unknown) => {
      createPostgresBundleRepositoryMock(pool);
      return createInMemoryBundleRepository();
    },
    createPostgresRecommendationRepository: (pool: unknown) => {
      createPostgresRecommendationRepositoryMock(pool);
      return createInMemoryRecommendationRepository();
    },
    createPostgresCampaignRepository: (pool: unknown) => {
      createPostgresCampaignRepositoryMock(pool);
      return createInMemoryCampaignRepository();
    },
    createPostgresServiceAreaRepository: (pool: unknown) => {
      createPostgresServiceAreaRepositoryMock(pool);
      return createInMemoryServiceAreaRepository();
    },
    createPostgresServiceAreaProductRepository: (pool: unknown) => {
      createPostgresServiceAreaProductRepositoryMock(pool);
      return createInMemoryServiceAreaProductRepository();
    },
    createPostgresBiEventLogRepository: async (pool: unknown) => {
      createPostgresBiEventLogRepositoryMock(pool);
      return createInMemoryBiEventLogRepository();
    },
    createPostgresFulfillmentRoutingRepository: (pool: unknown) => {
      createPostgresFulfillmentRoutingRepositoryMock(pool);
      return createInMemoryFulfillmentRoutingRepository();
    },
  };
});

// ims-postgres-alternate epic: services.ts's inventory branch also calls
// out to a real Postgres-backed adapter now, sharing the same mocked
// (config-capture-only, non-functional) pg.Pool instance -- mocked here the
// same "record what it's called with, return a real working adapter under
// the hood" way as adapter-postgres above, so buildServices() keeps running
// completely unmodified downstream.
// per-demo-backend-diversity epic: services.ts now constructs a real
// MongoClient itself (createMongoAdapter/createMongoCategoryRepository/
// createMongoProductCategoryRepository all take an already-connected `db`,
// mirroring pgPool sharing) rather than calling connectMongoAdapter --
// mocked at both the "mongodb" package level (MongoClient) and the adapter
// level (the three create* functions) below.
const createMongoAdapterMock = vi.fn();
const createMongoCategoryRepositoryMock = vi.fn();
const createMongoProductCategoryRepositoryMock = vi.fn();
vi.mock("@mercatus-liber/adapter-mongodb", async () => {
  const { createSqliteAdapter } = await import("@mercatus-liber/adapter-sqlite");
  const { createInMemoryCategoryRepository, createInMemoryProductCategoryRepository } = await import(
    "@mercatus-liber/marketing-catalog"
  );
  return {
    createMongoAdapter: async (db: unknown) => {
      createMongoAdapterMock(db);
      return createSqliteAdapter(":memory:");
    },
    createMongoCategoryRepository: async (db: unknown) => {
      createMongoCategoryRepositoryMock(db);
      return createInMemoryCategoryRepository();
    },
    createMongoProductCategoryRepository: (db: unknown) => {
      createMongoProductCategoryRepositoryMock(db);
      return createInMemoryProductCategoryRepository();
    },
  };
});

vi.mock("mongodb", () => ({
  MongoClient: class {
    config: unknown;
    constructor(uri: string, options: unknown) {
      this.config = { uri, options };
      mongoClientConfigs.push(this.config);
    }
    async connect() {}
    db() {
      // A plain marker object -- never a real Db, just something identity-
      // comparable so the shared-connection assertion below can confirm
      // createMongoAdapter/createMongoCategoryRepository/
      // createMongoProductCategoryRepository all received the SAME db.
      return { __fakeMongoDb: true };
    }
  },
}));

// adapter-convex epic: same posture as the MongoDB mock above --
// connectConvexAdapter/connectConvexCategoryRepository/
// connectConvexProductCategoryRepository each construct a real Convex
// client, so all three are mocked, recording the deployment URL each was
// called with. No live Convex project is assumed here. Convex's
// ConvexHttpClient is a stateless HTTP client (confirmed via research) --
// no connection-sharing concern the way pgPool/mongoDb have, so each
// mocked function independently records its own call, matching
// services.ts's own independent-connect-per-repository design.
const connectConvexAdapterMock = vi.fn();
const connectConvexCategoryRepositoryMock = vi.fn();
const connectConvexProductCategoryRepositoryMock = vi.fn();
vi.mock("@mercatus-liber/adapter-convex", async () => {
  const { createSqliteAdapter } = await import("@mercatus-liber/adapter-sqlite");
  const { createInMemoryCategoryRepository, createInMemoryProductCategoryRepository } = await import(
    "@mercatus-liber/marketing-catalog"
  );
  return {
    connectConvexAdapter: async (convexUrl: string) => {
      connectConvexAdapterMock(convexUrl);
      return createSqliteAdapter(":memory:");
    },
    connectConvexCategoryRepository: async (convexUrl: string) => {
      connectConvexCategoryRepositoryMock(convexUrl);
      return createInMemoryCategoryRepository();
    },
    connectConvexProductCategoryRepository: async (convexUrl: string) => {
      connectConvexProductCategoryRepositoryMock(convexUrl);
      return createInMemoryProductCategoryRepository();
    },
  };
});

vi.mock("@mercatus-liber/adapter-postgres-inventory", async () => {
  const { createInMemoryInventoryAdapter } = await import("@mercatus-liber/inventory");
  return {
    createPostgresInventoryAdapter: async (pool: unknown) => {
      createPostgresInventoryAdapterMock(pool);
      return createInMemoryInventoryAdapter();
    },
  };
});

vi.mock("pg", () => ({
  Pool: class {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
      poolConfigs.push(config);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createPostgresAdapterMock.mockClear();
  createPostgresCategoryRepositoryMock.mockClear();
  createPostgresProductCategoryRepositoryMock.mockClear();
  createPostgresInventoryAdapterMock.mockClear();
  createPostgresCatalogRepositoryMock.mockClear();
  createPostgresProductCatalogRepositoryMock.mockClear();
  createPostgresCartRepositoryMock.mockClear();
  createPostgresOrderRepositoryMock.mockClear();
  createPostgresCustomerProfileRepositoryMock.mockClear();
  createPostgresPromotionRepositoryMock.mockClear();
  createPostgresReviewRepositoryMock.mockClear();
  createPostgresStorefrontViewRepositoryMock.mockClear();
  createPostgresBundleRepositoryMock.mockClear();
  createPostgresRecommendationRepositoryMock.mockClear();
  createPostgresCampaignRepositoryMock.mockClear();
  createPostgresServiceAreaRepositoryMock.mockClear();
  createPostgresServiceAreaProductRepositoryMock.mockClear();
  createPostgresBiEventLogRepositoryMock.mockClear();
  createPostgresFulfillmentRoutingRepositoryMock.mockClear();
  createMongoAdapterMock.mockClear();
  createMongoCategoryRepositoryMock.mockClear();
  createMongoProductCategoryRepositoryMock.mockClear();
  connectConvexAdapterMock.mockClear();
  connectConvexCategoryRepositoryMock.mockClear();
  connectConvexProductCategoryRepositoryMock.mockClear();
  poolConfigs.length = 0;
  mongoClientConfigs.length = 0;
});

describe("Persistence wiring (lib/services.ts)", () => {
  it("defaults to in-memory SQLite, byte-for-byte unchanged, when neither DATABASE_URL nor SQLITE_FILE_PATH is set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SQLITE_FILE_PATH", "");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).not.toHaveBeenCalled();
    expect(createPostgresInventoryAdapterMock).not.toHaveBeenCalled();
    // Still fully functional off the in-memory default -- the seeded demo
    // catalog is there, same as before this story.
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
  });

  it("constructs a real file-backed SQLite adapter at SQLITE_FILE_PATH when set and DATABASE_URL is unset, and the file genuinely exists on disk after seeding", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "services-persistence-test-"));
    const sqliteFilePath = path.join(tmpDir, "catalog.db");

    try {
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("SQLITE_FILE_PATH", sqliteFilePath);
      vi.resetModules();

      const { getServicesForDemo } = await import("../lib/services.js");
      const services = await getServicesForDemo("print-shop");

      expect(createPostgresAdapterMock).not.toHaveBeenCalled();
      expect(createPostgresInventoryAdapterMock).not.toHaveBeenCalled();
      expect(fs.existsSync(sqliteFilePath)).toBe(true);
      expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("constructs a Postgres adapter via DATABASE_URL when set, taking priority over SQLITE_FILE_PATH, and categories share the same pool", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("SQLITE_FILE_PATH", "/tmp/should-not-be-used-services-test.db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).toHaveBeenCalledTimes(1);
    expect(createPostgresInventoryAdapterMock).toHaveBeenCalledTimes(1);
    expect(createPostgresCategoryRepositoryMock).toHaveBeenCalledTimes(1);
    expect(createPostgresProductCategoryRepositoryMock).toHaveBeenCalledTimes(1);
    // Catalog, inventory, AND categories all share the exact same pool
    // instance -- one Pool constructed from DATABASE_URL, not several.
    const pool = createPostgresAdapterMock.mock.calls[0]![0];
    expect(createPostgresInventoryAdapterMock.mock.calls[0]![0]).toBe(pool);
    expect(createPostgresCategoryRepositoryMock.mock.calls[0]![0]).toBe(pool);
    expect(createPostgresProductCategoryRepositoryMock.mock.calls[0]![0]).toBe(pool);
    // max: 1 -- real production fix, confirmed necessary live (Supavisor's
    // EMAXCONNSESSION under real serverless concurrency); see services.ts's
    // own doc comment at the pgPool construction site.
    expect(poolConfigs).toEqual([{ connectionString: "postgres://user:pass@localhost:5432/db", max: 1 }]);
    expect(fs.existsSync("/tmp/should-not-be-used-services-test.db")).toBe(false);
    // The mocked Postgres adapter is still a real, working adapter under
    // the hood -- seeding proceeds normally.
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
  });

  // full-commerce-persistence-audit epic: the 13 subsystems newly wired onto
  // real Postgres persistence (plus the Catalog entity's own 2 repositories)
  // -- same "env var truthy picks the real adapter, sharing the SAME pool
  // instance every other Postgres-backed repository in this demo's build
  // already uses" pattern this file already covers for categories/inventory
  // above, extended here to every remaining repository lib/services.ts's
  // buildServices() now wires.
  it("wires every newly-added subsystem (Catalog entity, cart, orders, customer profiles, promotions, reviews, storefront views, bundles, recommendations, advertising, service areas, BI event log, fulfillment routing) to real Postgres when DATABASE_URL is set, all sharing the same pool", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    const pool = createPostgresAdapterMock.mock.calls[0]![0];
    const newSubsystemMocks = [
      createPostgresCatalogRepositoryMock,
      createPostgresProductCatalogRepositoryMock,
      createPostgresCartRepositoryMock,
      createPostgresOrderRepositoryMock,
      createPostgresCustomerProfileRepositoryMock,
      createPostgresPromotionRepositoryMock,
      createPostgresReviewRepositoryMock,
      createPostgresStorefrontViewRepositoryMock,
      createPostgresBundleRepositoryMock,
      createPostgresRecommendationRepositoryMock,
      createPostgresCampaignRepositoryMock,
      createPostgresServiceAreaRepositoryMock,
      createPostgresServiceAreaProductRepositoryMock,
      createPostgresBiEventLogRepositoryMock,
      createPostgresFulfillmentRoutingRepositoryMock,
    ];
    for (const mock of newSubsystemMocks) {
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0]![0]).toBe(pool);
    }
    // Still fully functional off the (mocked, in-memory-backed-under-the-
    // hood) Postgres adapters -- seeding proceeds normally end to end,
    // including the new real Catalog entity (see lib/seed.ts's
    // seedRealCatalog).
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
    const printShopCatalog = await services.catalog.getCatalogBySlug("the-print-shop");
    expect(printShopCatalog).not.toBeNull();
    expect((await services.catalog.listProductsInCatalog(printShopCatalog!.id)).length).toBeGreaterThan(0);
  });

  it("keeps every newly-added subsystem on the in-memory reference default when no persistence backend is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SQLITE_FILE_PATH", "");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    const newSubsystemMocks = [
      createPostgresCatalogRepositoryMock,
      createPostgresProductCatalogRepositoryMock,
      createPostgresCartRepositoryMock,
      createPostgresOrderRepositoryMock,
      createPostgresCustomerProfileRepositoryMock,
      createPostgresPromotionRepositoryMock,
      createPostgresReviewRepositoryMock,
      createPostgresStorefrontViewRepositoryMock,
      createPostgresBundleRepositoryMock,
      createPostgresRecommendationRepositoryMock,
      createPostgresCampaignRepositoryMock,
      createPostgresServiceAreaRepositoryMock,
      createPostgresServiceAreaProductRepositoryMock,
      createPostgresBiEventLogRepositoryMock,
      createPostgresFulfillmentRoutingRepositoryMock,
    ];
    for (const mock of newSubsystemMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
    // Still fully functional off the real in-memory reference
    // implementations -- the seeded Catalog entity is there too.
    const printShopCatalog = await services.catalog.getCatalogBySlug("the-print-shop");
    expect(printShopCatalog).not.toBeNull();
    expect((await services.catalog.listProductsInCatalog(printShopCatalog!.id)).length).toBeGreaterThan(0);
  });

  it("constructs a MongoDB adapter via MONGODB_URL when set and DATABASE_URL is unset, and categories share the same db", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");
    vi.stubEnv("SQLITE_FILE_PATH", "/tmp/should-not-be-used-mongo-test.db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).not.toHaveBeenCalled();
    expect(createMongoAdapterMock).toHaveBeenCalledTimes(1);
    expect(createMongoCategoryRepositoryMock).toHaveBeenCalledTimes(1);
    expect(createMongoProductCategoryRepositoryMock).toHaveBeenCalledTimes(1);
    // Catalog and categories share the exact same `db`, from ONE MongoClient
    // -- not a separate client per repository (real connection-pool-
    // exhaustion risk, researched this session; see services.ts's own doc
    // comment at the mongoClient construction site).
    const db = createMongoAdapterMock.mock.calls[0]![0];
    expect(createMongoCategoryRepositoryMock.mock.calls[0]![0]).toBe(db);
    expect(createMongoProductCategoryRepositoryMock.mock.calls[0]![0]).toBe(db);
    expect(mongoClientConfigs).toEqual([
      {
        uri: "mongodb+srv://user:pass@cluster0.mongodb.net/shop",
        options: { maxPoolSize: 5, maxIdleTimeMS: 60000 },
      },
    ]);
    expect(fs.existsSync("/tmp/should-not-be-used-mongo-test.db")).toBe(false);
    // The mocked Mongo adapter is still a real, working adapter under the
    // hood -- seeding proceeds normally.
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
  });

  it("DATABASE_URL wins over MONGODB_URL when both are set -- a deployment picks one real backend, not a race", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).toHaveBeenCalledTimes(1);
    expect(createMongoAdapterMock).not.toHaveBeenCalled();
  });

  it("constructs a Convex adapter via CONVEX_URL when set and neither DATABASE_URL nor MONGODB_URL is set, categories included", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "");
    vi.stubEnv("CONVEX_URL", "https://my-deployment-123.convex.cloud");
    vi.stubEnv("SQLITE_FILE_PATH", "/tmp/should-not-be-used-convex-test.db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).not.toHaveBeenCalled();
    expect(createMongoAdapterMock).not.toHaveBeenCalled();
    expect(connectConvexAdapterMock).toHaveBeenCalledTimes(1);
    expect(connectConvexAdapterMock).toHaveBeenCalledWith("https://my-deployment-123.convex.cloud");
    expect(connectConvexCategoryRepositoryMock).toHaveBeenCalledWith("https://my-deployment-123.convex.cloud");
    expect(connectConvexProductCategoryRepositoryMock).toHaveBeenCalledWith("https://my-deployment-123.convex.cloud");
    expect(fs.existsSync("/tmp/should-not-be-used-convex-test.db")).toBe(false);
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
  });

  it("MONGODB_URL wins over CONVEX_URL when both are set (and DATABASE_URL is not)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");
    vi.stubEnv("CONVEX_URL", "https://my-deployment-123.convex.cloud");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    await getServicesForDemo("print-shop");

    expect(createMongoAdapterMock).toHaveBeenCalledTimes(1);
    expect(connectConvexAdapterMock).not.toHaveBeenCalled();
  });

  describe("per-demo env-var overrides (resolveDemoPersistenceEnv)", () => {
    it("a demo with no per-demo override vars falls through to the global chain, unchanged", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
      vi.resetModules();

      const { getServicesForDemo } = await import("../lib/services.js");
      await getServicesForDemo("northline");

      expect(createPostgresAdapterMock).toHaveBeenCalledTimes(1);
    });

    it("a demo-specific override wins over the global chain entirely, even when the global chain would resolve to a HIGHER-priority backend", async () => {
      // The real bug the all-or-nothing design avoids: if this fell back
      // per-field to the global DATABASE_URL for northline's unset
      // NORTHLINE_DATABASE_URL, northline would resolve to Postgres and
      // never reach Mongo, since Postgres wins the priority chain.
      vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
      vi.stubEnv("NORTHLINE_MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/northline");
      vi.resetModules();

      const { getServicesForDemo } = await import("../lib/services.js");
      await getServicesForDemo("northline");

      expect(createPostgresAdapterMock).not.toHaveBeenCalled();
      expect(createMongoAdapterMock).toHaveBeenCalledTimes(1);
      expect(mongoClientConfigs[0]).toMatchObject({
        uri: "mongodb+srv://user:pass@cluster0.mongodb.net/northline",
      });
    });

    it("two demos in the same process can genuinely resolve to two different real backends", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
      vi.stubEnv("BROADLEAF_CONVEX_URL", "https://kindhearted-corgi-798.convex.cloud");
      vi.resetModules();

      const { getServicesForDemo } = await import("../lib/services.js");
      await getServicesForDemo("print-shop");
      await getServicesForDemo("broadleaf");

      expect(createPostgresAdapterMock).toHaveBeenCalledTimes(1);
      expect(connectConvexAdapterMock).toHaveBeenCalledTimes(1);
      expect(connectConvexAdapterMock).toHaveBeenCalledWith("https://kindhearted-corgi-798.convex.cloud");
    });

    it("demoEnvPrefix derives PRINT_SHOP / NORTHLINE / BROADLEAF from the real demo slugs", async () => {
      vi.resetModules();
      const { demoEnvPrefix } = await import("../lib/services.js");
      expect(demoEnvPrefix("print-shop")).toBe("PRINT_SHOP");
      expect(demoEnvPrefix("northline")).toBe("NORTHLINE");
      expect(demoEnvPrefix("broadleaf")).toBe("BROADLEAF");
    });
  });
});
