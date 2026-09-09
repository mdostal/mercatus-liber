/**
 * image-cdn epic: proves the real migration-safety concern createSqliteAdapter's
 * own header comment documents -- SCHEMA_SQL's `CREATE TABLE IF NOT EXISTS`
 * is a no-op against a file-backed DB that already existed (created by an
 * older version of this adapter, before the `images` column existed), so
 * the defensive `ALTER TABLE products ADD COLUMN images TEXT` right after
 * it is the only thing that actually adds the column in that case. This
 * builds a real pre-migration-shape database file by hand (via a bare
 * better-sqlite3 connection, not this adapter), then opens it through
 * createSqliteAdapter and proves saving/reading a product's images now
 * works against that exact file -- not just against a fresh `:memory:` DB,
 * which would already have the column from SCHEMA_SQL alone and so
 * wouldn't actually exercise the ALTER TABLE fallback path at all.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Product } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "../src/index.js";

describe("createSqliteAdapter -- images column migration against a pre-existing file", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-sqlite-images-migration-test-"));
    dbFilePath = path.join(tmpDir, "catalog.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds the images column to a real pre-existing DB file that predates it, and the adapter works normally against it afterward", async () => {
    // Build the OLD table shape by hand -- exactly what SCHEMA_SQL produced
    // before this epic, no `images` column at all.
    const legacy = new Database(dbFilePath);
    legacy.exec(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        identifying_attribute_keys TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);
    legacy.prepare(
      `INSERT INTO products (id, slug, title, description, identifying_attribute_keys, status)
       VALUES (@id, @slug, @title, @description, @identifyingAttributeKeys, @status)`,
    ).run({
      id: "legacy-1",
      slug: "legacy-product",
      title: "A Product Saved Before Images Existed",
      description: "Pre-migration data.",
      identifyingAttributeKeys: "[]",
      status: "active",
    });
    legacy.close();

    // Now open that exact file through the real adapter -- this is what
    // exercises the ALTER TABLE fallback.
    const adapter = createSqliteAdapter(dbFilePath);

    // The pre-existing row reads back fine, with no images (never had any).
    const legacyProduct = await adapter.products.get("legacy-1");
    expect(legacyProduct?.title).toBe("A Product Saved Before Images Existed");
    expect(legacyProduct?.images).toBeUndefined();

    // And the column now genuinely exists and works for new writes.
    const withImages: Product = {
      id: "new-1",
      slug: "new-product",
      title: "A Product Saved After The Migration",
      description: "Post-migration data.",
      identifyingAttributeKeys: [],
      status: "active",
      images: [{ url: "https://example.com/new.jpg", alt: "A new product" }],
    };
    await adapter.products.save(withImages);
    const found = await adapter.products.get("new-1");
    expect(found?.images).toEqual(withImages.images);
  });
});
