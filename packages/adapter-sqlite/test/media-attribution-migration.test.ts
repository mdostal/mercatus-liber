/**
 * Mirrors images-migration.test.ts exactly, for the three columns the
 * product-media-attribution epic added (videos/viewer_url/license) --
 * proves openSqliteDb's defensive ALTER TABLE fallback actually adds them
 * to a real pre-existing DB file that predates not just these three
 * columns but even `images` itself, and that both old and new rows read/
 * write correctly afterward.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Product } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "../src/index.js";

describe("createSqliteAdapter -- videos/viewer_url/license column migration against a pre-existing file", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-sqlite-media-attribution-migration-test-"));
    dbFilePath = path.join(tmpDir, "catalog.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds the videos/viewer_url/license columns to a real pre-existing DB file that predates them (and predates images too), and the adapter works normally against it afterward", async () => {
    // Build the OLD table shape by hand -- exactly what SCHEMA_SQL produced
    // before even the image-cdn epic, no images/videos/viewer_url/license
    // columns at all.
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
      title: "A Product Saved Before Media Attribution Existed",
      description: "Pre-migration data.",
      identifyingAttributeKeys: "[]",
      status: "active",
    });
    legacy.close();

    // Now open that exact file through the real adapter -- this is what
    // exercises the ALTER TABLE fallback for all three new columns.
    const adapter = createSqliteAdapter(dbFilePath);

    // The pre-existing row reads back fine, with none of the new fields.
    const legacyProduct = await adapter.products.get("legacy-1");
    expect(legacyProduct?.title).toBe("A Product Saved Before Media Attribution Existed");
    expect(legacyProduct?.videos).toBeUndefined();
    expect(legacyProduct?.viewerUrl).toBeUndefined();
    expect(legacyProduct?.license).toBeUndefined();

    // And the columns now genuinely exist and work for new writes.
    const withMedia: Product = {
      id: "new-1",
      slug: "new-product",
      title: "A Product Saved After The Migration",
      description: "Post-migration data.",
      identifyingAttributeKeys: [],
      status: "active",
      videos: [{ url: "https://example.com/teardown.mp4", title: "Teardown" }],
      viewerUrl: "https://example.com/model.glb",
      license: "Self-modeled, owned -- OSS/CC-BY",
    };
    await adapter.products.save(withMedia);
    const found = await adapter.products.get("new-1");
    expect(found?.videos).toEqual(withMedia.videos);
    expect(found?.viewerUrl).toBe(withMedia.viewerUrl);
    expect(found?.license).toBe(withMedia.license);
  });
});
