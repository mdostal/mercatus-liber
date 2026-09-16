import type { Pool } from "pg";
import type { CustomerProfile, CustomerProfileRepository } from "@mercatus-liber/account";

/**
 * Self-contained schema for the account persistence surface. Run at
 * createPostgresCustomerProfileRepository call time -- same "own
 * schema-init, no shared-file edits" pattern this package's cart.ts/
 * orders.ts already follow (see this file's header context: several other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once). customer_profiles is not
 * part of schema.ts's SCHEMA_SQL.
 *
 * The simplest entity in the whole epic: a single flat table, no JSONB, no
 * nested collection, no transaction needed. email is UNIQUE so getByEmail is
 * a real indexed lookup, not a table scan (mirroring this package's own
 * products.slug/categories.slug precedent).
 */
const ACCOUNTS_DDL = `
  CREATE TABLE IF NOT EXISTS customer_profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  )
`;

interface CustomerProfileRow {
  id: string;
  email: string;
  name: string;
}

function rowToCustomerProfile(row: CustomerProfileRow): CustomerProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
  };
}

/**
 * Real Postgres-backed CustomerProfileRepository -- until now
 * @mercatus-liber/account's CustomerProfileRepository was always constructed
 * in-memory by the reference storefront (see apps/reference-storefront/lib/
 * services.ts), so every real customer account was lost on every server
 * restart. Mirrors cart.ts's/categories.ts's own repository shape almost
 * exactly: `get`/`getByEmail` each await this file's own schema-init before
 * querying, `save` is a real `ON CONFLICT (id) DO UPDATE` upsert so saving
 * the same id twice updates the row in place rather than duplicating it.
 */
export function createPostgresCustomerProfileRepository(pool: Pool): CustomerProfileRepository {
  const ready = pool.query(ACCOUNTS_DDL);

  return {
    async get(id: string): Promise<CustomerProfile | null> {
      await ready;
      const result = await pool.query<CustomerProfileRow>("SELECT * FROM customer_profiles WHERE id = $1", [id]);
      return result.rows[0] ? rowToCustomerProfile(result.rows[0]) : null;
    },
    async getByEmail(email: string): Promise<CustomerProfile | null> {
      await ready;
      const result = await pool.query<CustomerProfileRow>(
        "SELECT * FROM customer_profiles WHERE email = $1",
        [email],
      );
      return result.rows[0] ? rowToCustomerProfile(result.rows[0]) : null;
    },
    async save(profile: CustomerProfile): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO customer_profiles (id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           name = EXCLUDED.name`,
        [profile.id, profile.email, profile.name],
      );
    },
  };
}
