import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll } from "vitest";
import { describeStoreApiKeyContract } from "../../store-api/test/key-repository-contract.js";
import { createSqliteStoreApiKeyRepository } from "../src/store-api-keys.js";

const dir = mkdtempSync(join(tmpdir(), "keys-sqlite-"));
const handles: Database.Database[] = [];
let n = 0;
afterAll(() => {
  for (const db of handles) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describeStoreApiKeyContract("SQLite", async () => {
  const path = join(dir, `k-${n++}.db`);
  return {
    open() {
      const db = new Database(path);
      handles.push(db);
      return createSqliteStoreApiKeyRepository(db);
    },
  };
});
