import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describeManualRecordStoreContract } from "../../fulfillment/test/manual-record-store-contract.js";
import { createPostgresManualFulfillmentRecordStore } from "../src/manual-fulfillment-records.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query } as unknown as Pool;
}

describeManualRecordStoreContract(
  "Postgres",
  async () => {
    const db = new PGlite();
    return { open: () => createPostgresManualFulfillmentRecordStore(poolFor(db)) };
  },
  // PGlite compiles its WASM on first start, which can take several seconds.
  { timeout: 30_000 },
);
