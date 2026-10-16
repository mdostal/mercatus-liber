/**
 * free-tier-resilience-and-keepalive epic (fr-01): proves both halves of
 * this story's acceptance bar for lib/backend-unreachable.ts and
 * components/backend-asleep-page.tsx -- not just "errors get caught."
 *
 * 1. The exact real Postgres Supavisor pooler-tenant-not-found error shape
 *    (confirmed live via Vercel function logs, see design-discussion.md:
 *    `error: (ENOTFOUND) tenant/user postgres.dhjnancsmuteowfgfebx not
 *    found`, surfaced as a pg DatabaseError-shaped object with
 *    `.code === "ENOTFOUND"`) and the real `mongodb` driver's own
 *    `MongoServerSelectionError` class are both detected, and a fake
 *    persistence adapter that throws either one is caught by
 *    `readOrBackendUnreachable` -- the graceful `{ ok: false }` result the
 *    real app/demo/[demoSlug]/layout.tsx uses to render BackendAsleepPage
 *    instead of crashing.
 * 2. A genuinely unrelated real error (a plain `TypeError`, and separately a
 *    real-but-different Postgres error carrying an actual SQLSTATE) is NOT
 *    caught -- it rethrows unchanged, proven by asserting the call rejects
 *    with that exact error, not swallowed into the asleep state.
 *
 * `buildTestCatalogServices`-style real wiring (same shape as
 * test/helpers.ts) is used for the persistence-adapter-injection case so
 * this exercises the real `@mercatus-liber/catalog` -> persistence read
 * path, not a reimplementation of it.
 */
import { MongoServerSelectionError, type TopologyDescription } from "mongodb";
import { createCatalogService, createInMemoryCatalogRepository, createInMemoryProductCatalogRepository } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import type { CatalogPersistenceAdapter } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import BackendAsleepPage from "../components/backend-asleep-page.js";
import { isBackendUnreachableError, readOrBackendUnreachable } from "../lib/backend-unreachable.js";

/**
 * Real constructor (node_modules/mongodb/lib/error.js), but its TS typing
 * requires a full real `TopologyDescription` as `reason` even though the
 * constructor itself only reads `reason.error?.code` at runtime -- this
 * cast only relaxes that STATIC type for test construction, the same
 * "narrow structural interface vs. a stricter real-driver type" pragmatic
 * cast lib/services.ts/packages/adapter-mongodb already use at their own
 * real-driver boundaries.
 */
function fakeMongoServerSelectionError(): MongoServerSelectionError {
  return new MongoServerSelectionError(
    "Server selection timed out after 30000 ms",
    {} as unknown as TopologyDescription,
  );
}

/** The exact real Supavisor pooler error shape, confirmed live (design-discussion.md). pg's own DatabaseError (node_modules/pg-protocol/dist/messages.js) is a plain `Error` subclass with `.code`/`.message` set from the server's wire-protocol fields -- replicated here without needing a real `pg` connection. */
function fakeSupavisorPoolerError(): Error {
  const error = new Error('tenant/user "postgres.dhjnancsmuteowfgfebx" not found');
  (error as Error & { code: string }).code = "ENOTFOUND";
  return error;
}

/** A real, different Postgres error -- genuine SQLSTATE `.code`, never the literal "ENOTFOUND" Supavisor uses for this one specific failure. Must NOT be caught by the detector. */
function fakeUnrelatedPostgresError(): Error {
  const error = new Error('duplicate key value violates unique constraint "products_slug_key"');
  (error as Error & { code: string }).code = "23505";
  return error;
}

describe("isBackendUnreachableError (fr-01)", () => {
  it("matches the real, verified Supavisor pooler-tenant-not-found shape", () => {
    expect(isBackendUnreachableError(fakeSupavisorPoolerError())).toBe(true);
  });

  it("matches the real mongodb driver's MongoServerSelectionError", () => {
    const error = fakeMongoServerSelectionError();
    expect(isBackendUnreachableError(error)).toBe(true);
    expect(error.name).toBe("MongoServerSelectionError");
  });

  it("does NOT match a plain TypeError", () => {
    expect(isBackendUnreachableError(new TypeError("Cannot read properties of undefined (reading 'foo')"))).toBe(
      false,
    );
  });

  it("does NOT match a real, different Postgres error (genuine SQLSTATE, not the pooler's ENOTFOUND)", () => {
    expect(isBackendUnreachableError(fakeUnrelatedPostgresError())).toBe(false);
  });

  it("does NOT match a generic Node DNS ENOTFOUND that never mentions a tenant", () => {
    const error = new Error("getaddrinfo ENOTFOUND db.totally-unrelated-host.example.com");
    (error as Error & { code: string }).code = "ENOTFOUND";
    expect(isBackendUnreachableError(error)).toBe(false);
  });

  it("does NOT match a non-Error value", () => {
    expect(isBackendUnreachableError("just a string")).toBe(false);
    expect(isBackendUnreachableError(null)).toBe(false);
    expect(isBackendUnreachableError(undefined)).toBe(false);
  });
});

describe("readOrBackendUnreachable (fr-01)", () => {
  it("catches the real Postgres pooler error shape and reports { ok: false } instead of throwing", async () => {
    const result = await readOrBackendUnreachable(async () => {
      throw fakeSupavisorPoolerError();
    });
    expect(result).toEqual({ ok: false });
  });

  it("catches the real MongoServerSelectionError shape and reports { ok: false } instead of throwing", async () => {
    const result = await readOrBackendUnreachable(async () => {
      throw fakeMongoServerSelectionError();
    });
    expect(result).toEqual({ ok: false });
  });

  it("does NOT catch an unrelated TypeError -- it propagates as a real error", async () => {
    await expect(
      readOrBackendUnreachable(async () => {
        throw new TypeError("something else entirely broke");
      }),
    ).rejects.toThrow(TypeError);
  });

  it("does NOT catch a real, different Postgres error -- it propagates as a real error", async () => {
    await expect(
      readOrBackendUnreachable(async () => {
        throw fakeUnrelatedPostgresError();
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("returns the real value on success, unchanged", async () => {
    const result = await readOrBackendUnreachable(async () => 42);
    expect(result).toEqual({ ok: true, value: 42 });
  });
});

describe("readOrBackendUnreachable wired against a real @mercatus-liber/catalog persistence read (fr-01 acceptance bar)", () => {
  /** Builds a real CatalogService backed by a fake CatalogPersistenceAdapter whose `products.list` throws `toThrow` -- the actual shape lib/services.ts wires `createCatalogService({ persistence, ... })` to, see that file's `catalog` construction. */
  function buildCatalogWithFailingPersistence(toThrow: Error) {
    const failingPersistence: CatalogPersistenceAdapter = {
      products: {
        get: async () => null,
        getBySlug: async () => null,
        list: async () => {
          throw toThrow;
        },
        save: async () => {},
      },
      skus: {
        get: async () => null,
        listByProduct: async () => [],
        save: async () => {},
      },
      attributes: {
        listByProduct: async () => [],
        save: async () => {},
        remove: async () => {},
      },
    };
    return createCatalogService({
      persistence: failingPersistence,
      events: createInMemoryEventBus(),
      catalogs: createInMemoryCatalogRepository(),
      productCatalogs: createInMemoryProductCatalogRepository(),
    });
  }

  it("given a fake persistence adapter that throws the exact real Postgres pooler-error shape, renders the graceful { ok: false } state instead of crashing", async () => {
    const catalog = buildCatalogWithFailingPersistence(fakeSupavisorPoolerError());
    const result = await readOrBackendUnreachable(() => catalog.listProducts());
    expect(result).toEqual({ ok: false });
  });

  it("given a fake persistence adapter that throws an unrelated real error (TypeError), does NOT catch it -- it propagates as a real error", async () => {
    const catalog = buildCatalogWithFailingPersistence(new TypeError("unrelated real bug in the persistence layer"));
    await expect(readOrBackendUnreachable(() => catalog.listProducts())).rejects.toThrow(TypeError);
  });
});

describe("BackendAsleepPage (fr-01): the real, designed page rendered on a caught backend-unreachable error", () => {
  function flattenText(node: unknown): string {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(flattenText).join("");
    if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
      return flattenText((node as { props: { children?: unknown } }).props.children);
    }
    return "";
  }

  const element = BackendAsleepPage({ demoSlug: "print-shop" });
  const text = flattenText(element);

  it("names this demo and says plainly that it may be asleep -- not a vague 'something went wrong'", () => {
    expect(text).toContain("print-shop");
    expect(text).toMatch(/may be asleep/i);
    expect(text.toLowerCase()).not.toContain("something went wrong");
  });

  it("honestly discloses the real cause (a free-tier backend pausing itself) and that uptime isn't guaranteed", () => {
    expect(text).toMatch(/free-tier/i);
    expect(text).toMatch(/pause/i);
    expect(text).toMatch(/open-source/i);
    expect(text).toMatch(/isn.t guaranteed/i);
  });

  it("renders a real manual retry action", () => {
    expect(text).toContain("Try again");
  });

  it("is a real designed page, not a bare string -- it's a full html document with brand-system styling", () => {
    expect((element as { type: unknown }).type).toBe("html");
  });
});
