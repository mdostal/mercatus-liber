/**
 * backup-restore-01: covers the persistence env-var wiring acceptance
 * criteria in .pHive/epics/data-backup-restore-and-adapter-portability/
 * stories/backup-restore-01-persistence-wiring-and-backup-restore.yaml for
 * lib/services.ts's `persistence` branch, plus (ims-postgres-alternate
 * epic) its sibling `inventory` branch, which shares the same DATABASE_URL/
 * pg.Pool. Same "mock the concrete adapter, keep everything downstream
 * real" shape as cms-persistence-wiring.test.ts's Sanity mock: no real
 * reachable Postgres instance is assumed here, so both
 * createPostgresAdapter (catalog) and createPostgresInventoryAdapter
 * (inventory) are mocked to record the pg Pool they're each constructed
 * with and to return a real, working in-memory-backed adapter under the
 * hood, so the rest of buildServices() (which seeds real catalog data
 * during construction) runs completely unmodified. pg's own `Pool`
 * constructor is mocked too, purely to capture the connection config passed
 * to it without needing a real network-capable Pool instance -- pg.Pool
 * itself is not exercised, just recorded.
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
const createPostgresInventoryAdapterMock = vi.fn();
const poolConfigs: unknown[] = [];

vi.mock("@mercatus-liber/adapter-postgres", async () => {
  const { createSqliteAdapter } = await import("@mercatus-liber/adapter-sqlite");
  return {
    createPostgresAdapter: async (pool: unknown) => {
      createPostgresAdapterMock(pool);
      return createSqliteAdapter(":memory:");
    },
  };
});

// ims-postgres-alternate epic: services.ts's inventory branch also calls
// out to a real Postgres-backed adapter now, sharing the same mocked
// (config-capture-only, non-functional) pg.Pool instance -- mocked here the
// same "record what it's called with, return a real working adapter under
// the hood" way as adapter-postgres above, so buildServices() keeps running
// completely unmodified downstream.
// adapter-mongodb epic: same "mock the concrete adapter, keep everything
// downstream real" shape -- no live MongoDB instance is assumed here
// either. connectMongoAdapter itself constructs a real MongoClient, so the
// whole function is mocked (not just a Pool-like construction arg the way
// the two Postgres mocks above are), recording the connection string it
// was called with.
const connectMongoAdapterMock = vi.fn();
vi.mock("@mercatus-liber/adapter-mongodb", async () => {
  const { createSqliteAdapter } = await import("@mercatus-liber/adapter-sqlite");
  return {
    connectMongoAdapter: async (connectionString: string) => {
      connectMongoAdapterMock(connectionString);
      return { adapter: createSqliteAdapter(":memory:"), close: async () => {} };
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
  createPostgresInventoryAdapterMock.mockClear();
  connectMongoAdapterMock.mockClear();
  poolConfigs.length = 0;
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

  it("constructs a Postgres adapter via DATABASE_URL when set, taking priority over SQLITE_FILE_PATH", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("SQLITE_FILE_PATH", "/tmp/should-not-be-used-services-test.db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).toHaveBeenCalledTimes(1);
    expect(createPostgresInventoryAdapterMock).toHaveBeenCalledTimes(1);
    // Both real Postgres-backed adapters share the exact same pool
    // instance -- one Pool constructed from DATABASE_URL, not two.
    expect(createPostgresAdapterMock.mock.calls[0]![0]).toBe(createPostgresInventoryAdapterMock.mock.calls[0]![0]);
    expect(poolConfigs).toEqual([{ connectionString: "postgres://user:pass@localhost:5432/db" }]);
    expect(fs.existsSync("/tmp/should-not-be-used-services-test.db")).toBe(false);
    // The mocked Postgres adapter is still a real, working adapter under
    // the hood -- seeding proceeds normally.
    expect((await services.catalog.listProducts()).length).toBeGreaterThan(0);
  });

  it("constructs a MongoDB adapter via MONGODB_URL when set and DATABASE_URL is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");
    vi.stubEnv("SQLITE_FILE_PATH", "/tmp/should-not-be-used-mongo-test.db");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostgresAdapterMock).not.toHaveBeenCalled();
    expect(connectMongoAdapterMock).toHaveBeenCalledTimes(1);
    expect(connectMongoAdapterMock).toHaveBeenCalledWith("mongodb+srv://user:pass@cluster0.mongodb.net/shop");
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
    expect(connectMongoAdapterMock).not.toHaveBeenCalled();
  });
});
