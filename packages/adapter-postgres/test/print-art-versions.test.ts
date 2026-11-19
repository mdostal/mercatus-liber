import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { describeSavedArtVersionRepositoryContract } from "../../print-art/test/saved-repository-contract.js";
import { createPostgresSavedArtVersionRepository } from "../src/print-art-versions.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query } as unknown as Pool;
}

describeSavedArtVersionRepositoryContract(
  "Postgres",
  async () => {
    const db = new PGlite();
    return { open: () => createPostgresSavedArtVersionRepository(poolFor(db)) };
  },
  // PGlite compiles its WASM on first start, which can take several seconds.
  { timeout: 30_000 },
);

describe("Postgres SavedArtVersionRepository on an existing table", () => {
  it("reads and writes a store's own table and id column", async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE back_print_versions (back_id TEXT NOT NULL, version INTEGER NOT NULL, copy JSONB NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (back_id, version))`);
    await db.query("INSERT INTO back_print_versions (back_id, version, copy, note) VALUES ($1, $2, $3, $4)", ["card", 2, JSON.stringify({ headline: "old" }), "from the shop"]);
    const repo = createPostgresSavedArtVersionRepository<{ headline: string }>(poolFor(db), { table: "back_print_versions", idColumn: "back_id" });
    expect(await repo.list("card")).toEqual([{ version: 2, copy: { headline: "old" }, note: "from the shop" }]);
    await repo.insert("card", { version: 3, copy: { headline: "new" }, note: "" });
    expect((await repo.list("card")).map((v) => v.version)).toEqual([2, 3]);
  }, 30_000);

  it("refuses table and column names that are not plain identifiers", () => {
    expect(() => createPostgresSavedArtVersionRepository(poolFor(new PGlite()), { table: "x; DROP TABLE y" })).toThrow();
    expect(() => createPostgresSavedArtVersionRepository(poolFor(new PGlite()), { idColumn: "Back-Id" })).toThrow();
  });
});
