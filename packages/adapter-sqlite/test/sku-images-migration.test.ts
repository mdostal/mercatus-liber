/**
 * sku-images epic: mirrors images-migration.test.ts exactly, one level
 * down -- proves the same real migration-safety concern for Sku.images
 * (not Product.images). Builds a real pre-migration-shape DB file by hand
 * (both products and skus tables, no `images` column on skus), opens it
 * through createSqliteAdapter, and proves the ALTER TABLE fallback adds
 * the column and both the pre-existing row and a new write work
 * afterward.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Product, Sku } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "../src/index.js";

describe("createSqliteAdapter -- skus.images column migration against a pre-existing file", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-sqlite-sku-images-migration-test-"));
    dbFilePath = path.join(tmpDir, "catalog.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds the images column to a real pre-existing skus table that predates it, and the adapter works normally against it afterward", async () => {
    // Build the OLD table shapes by hand -- exactly what SCHEMA_SQL produced
    // before this epic, no `images` column on skus (products already has
    // its own images column from the earlier image-cdn epic, included here
    // for a realistic pre-existing-DB shape).
    const legacy = new Database(dbFilePath);
    legacy.exec(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        identifying_attribute_keys TEXT NOT NULL,
        status TEXT NOT NULL,
        images TEXT
      );
      CREATE TABLE skus (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        identifying_attributes TEXT NOT NULL,
        price_amount INTEGER NOT NULL,
        price_currency TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);
    legacy.prepare(
      `INSERT INTO products (id, slug, title, description, identifying_attribute_keys, status, images)
       VALUES (@id, @slug, @title, @description, @identifyingAttributeKeys, @status, @images)`,
    ).run({
      id: "legacy-product-1",
      slug: "legacy-sunglasses",
      title: "Sunglasses Saved Before SKU Images Existed",
      description: "Pre-migration product.",
      identifyingAttributeKeys: JSON.stringify(["lens"]),
      status: "active",
      images: null,
    });
    legacy.prepare(
      `INSERT INTO skus (id, product_id, identifying_attributes, price_amount, price_currency, status)
       VALUES (@id, @productId, @identifyingAttributes, @priceAmount, @priceCurrency, @status)`,
    ).run({
      id: "legacy-sku-1",
      productId: "legacy-product-1",
      identifyingAttributes: JSON.stringify([{ key: "lens", value: "red" }]),
      priceAmount: 1999,
      priceCurrency: "USD",
      status: "active",
    });
    legacy.close();

    // Now open that exact file through the real adapter -- this is what
    // exercises the ALTER TABLE skus ADD COLUMN images fallback.
    const adapter = createSqliteAdapter(dbFilePath);

    // The pre-existing SKU reads back fine, with no images (never had any).
    const legacySku = await adapter.skus.get("legacy-sku-1");
    expect(legacySku?.productId).toBe("legacy-product-1");
    expect(legacySku?.images).toBeUndefined();

    // And the column now genuinely exists and works for new writes.
    const newProduct: Product = {
      id: "new-product-1",
      slug: "new-sunglasses",
      title: "Sunglasses Saved After The Migration",
      description: "Post-migration product.",
      identifyingAttributeKeys: ["lens"],
      status: "active",
    };
    await adapter.products.save(newProduct);
    const newSku: Sku = {
      id: "new-sku-1",
      productId: "new-product-1",
      identifyingAttributes: [{ key: "lens", value: "brown" }],
      price: { amount: 1999, currency: "USD" },
      status: "active",
      images: [{ url: "https://example.com/brown.jpg", alt: "Brown lens" }],
    };
    await adapter.skus.save(newSku);
    const found = await adapter.skus.get("new-sku-1");
    expect(found?.images).toEqual(newSku.images);
  });
});
