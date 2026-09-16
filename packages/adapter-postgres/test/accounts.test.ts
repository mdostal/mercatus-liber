/**
 * Real, table-backed CustomerProfileRepository coverage (see this package's
 * src/accounts.ts) -- @mercatus-liber/account's CustomerProfileRepository
 * was in-memory-only across every adapter, including Postgres, until now.
 *
 * Uses its OWN local fake Postgres Pool double, deliberately not the shared
 * test/fake-pool.ts -- this file is self-contained per this package's
 * file-isolation convention while multiple persistence subsystems land in
 * parallel (see categories.test.ts for the shared double this intentionally
 * does not use).
 */
import type { CustomerProfile } from "@mercatus-liber/account";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCustomerProfileRepository } from "../src/accounts.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeAccountsPool(): FakePool {
  const customerProfiles = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM customer_profiles WHERE id = $1") {
        const row = customerProfiles.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM customer_profiles WHERE email = $1") {
        // Real UNIQUE (email) column -- exactly one match, and a plain `=`
        // comparison is case-sensitive in Postgres by default (no citext /
        // LOWER() normalization here), matching the in-memory reference
        // repository's plain `===` comparison.
        const row = [...customerProfiles.values()].find((p) => p.email === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql.startsWith("INSERT INTO customer_profiles")) {
        const [id, email, name] = values as [string, string, string];
        customerProfiles.set(id, { id, email, name });
        return { rows: [] };
      }

      throw new Error(`FakeAccountsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresCustomerProfileRepository", () => {
  let pool: FakePool;
  let profiles: ReturnType<typeof createPostgresCustomerProfileRepository>;

  beforeEach(() => {
    pool = createFakeAccountsPool();
    profiles = createPostgresCustomerProfileRepository(pool as never);
  });

  const ada: CustomerProfile = {
    id: "cust-1",
    email: "ada@example.com",
    name: "Ada Lovelace",
  };

  it("saves and retrieves a profile by id", async () => {
    await profiles.save(ada);
    expect(await profiles.get("cust-1")).toEqual(ada);
  });

  it("retrieves a profile by email", async () => {
    await profiles.save(ada);
    const found = await profiles.getByEmail("ada@example.com");
    expect(found).toEqual(ada);
  });

  it("email lookup is case-sensitive, matching the in-memory reference's plain === comparison", async () => {
    await profiles.save(ada);
    expect(await profiles.getByEmail("Ada@Example.com")).toBeNull();
    expect(await profiles.getByEmail("ada@example.com")).toEqual(ada);
  });

  it("returns null for an unknown id", async () => {
    expect(await profiles.get("missing")).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    expect(await profiles.getByEmail("nobody@example.com")).toBeNull();
  });

  it("updates via resave -- changing the name and re-fetching shows the update", async () => {
    await profiles.save(ada);
    await profiles.save({ ...ada, name: "Ada, Countess of Lovelace" });

    const byId = await profiles.get("cust-1");
    expect(byId?.name).toBe("Ada, Countess of Lovelace");

    const byEmail = await profiles.getByEmail("ada@example.com");
    expect(byEmail?.name).toBe("Ada, Countess of Lovelace");
  });

  it("save is a real upsert on id -- no duplicate rows after resaving", async () => {
    await profiles.save(ada);
    await profiles.save({ ...ada, name: "Ada Byron" });
    // Only reachable via get/getByEmail, but confirm the email index still
    // resolves to a single, updated row rather than colliding on UNIQUE.
    expect(await profiles.getByEmail("ada@example.com")).toEqual({ ...ada, name: "Ada Byron" });
  });
});
