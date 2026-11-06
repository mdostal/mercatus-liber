import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll } from "vitest";
import { describeCatalogMappingContract } from "../../fulfillment/test/catalog-mapping-contract.js";
// The contract imports fulfillment's source directly, so no build dependency is added.
import { createSqliteProviderCatalogMappingRepository } from "../src/provider-catalog-mappings.js";

const dir = mkdtempSync(join(tmpdir(), "mappings-sqlite-"));
const handles: Database.Database[] = [];
let n = 0;
afterAll(() => {
  for (const db of handles) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describeCatalogMappingContract("SQLite", async () => {
  const path = join(dir, `m-${n++}.db`);
  return {
    open() {
      const db = new Database(path);
      handles.push(db);
      return createSqliteProviderCatalogMappingRepository(db);
    },
  };
});
