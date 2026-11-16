import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describeProviderOrderLinkContract } from "../../fulfillment/test/provider-order-links-contract.js";
import { createPostgresProviderOrderLinkRepository } from "../src/provider-order-links.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query } as unknown as Pool;
}

describeProviderOrderLinkContract(
  "Postgres",
  async () => {
    const db = new PGlite();
    return { open: () => createPostgresProviderOrderLinkRepository(poolFor(db)) };
  },
  // PGlite compiles its WASM on first start, which can take several seconds.
  { timeout: 30_000 },
);
