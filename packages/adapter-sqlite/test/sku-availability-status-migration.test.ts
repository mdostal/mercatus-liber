/**
 * sku-availability-status epic: mirrors sku-images-migration.test.ts
 * exactly -- proves the same real migration-safety concern for
 * Sku.availabilityStatus/availabilityNote. Builds a real pre-migration-
 * shape DB file by hand (skus table already has `images` from the prior
 * epic, but not the two new columns), opens it through
 * createSqliteAdapter, and proves the ALTER TABLE fallback adds both
 * columns and both the pre-existing row and a new write work afterward.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Product, Sku } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteAdapter } from "../src/index.js";

describe("createSqliteAdapter -- skus.availability_status/availability_note column migration against a pre-existing file", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-sqlite-sku-availability-migration-test-"));
    dbFilePath = path.join(tmpDir, "catalog.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds both columns to a real pre-existing skus table that predates them, and the adapter works normally against it afterward", async () => {
    // Build the OLD table shapes by hand -- the skus table already has
    // `images` (the prior epic), but not availability_status/
    // availability_note, exactly the real-world shape this migration
    // needs to handle.
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
        status TEXT NOT NULL,
        images TEXT
      );
    `);
    legacy.prepare(
      `INSERT INTO products (id, slug, title, description, identifying_attribute_keys, status, images)
       VALUES (@id, @slug, @title, @description, @identifyingAttributeKeys, @status, @images)`,
    ).run({
      id: "legacy-product-1",
      slug: "legacy-caddy",
      title: "Caddy Saved Before Availability Status Existed",
      description: "Pre-migration product.",
      identifyingAttributeKeys: JSON.stringify(["color"]),
      status: "active",
      images: null,
    });
    legacy.prepare(
      `INSERT INTO skus (id, product_id, identifying_attributes, price_amount, price_currency, status, images)
       VALUES (@id, @productId, @identifyingAttributes, @priceAmount, @priceCurrency, @status, @images)`,
    ).run({
      id: "legacy-sku-1",
      productId: "legacy-product-1",
      identifyingAttributes: JSON.stringify([{ key: "color", value: "blue" }]),
      priceAmount: 1999,
      priceCurrency: "USD",
      status: "active",
      images: null,
    });
    legacy.close();

    // Now open that exact file through the real adapter -- this is what
    // exercises the ALTER TABLE skus ADD COLUMN availability_status/
    // availability_note fallback.
    const adapter = createSqliteAdapter(dbFilePath);

    // The pre-existing SKU reads back fine, with no availability status
    // (never had any -- means active).
    const legacySku = await adapter.skus.get("legacy-sku-1");
    expect(legacySku?.productId).toBe("legacy-product-1");
    expect(legacySku?.availabilityStatus).toBeUndefined();
    expect(legacySku?.availabilityNote).toBeUndefined();

    // And the columns now genuinely exist and work for new writes.
    const newProduct: Product = {
      id: "new-product-1",
      slug: "new-caddy",
      title: "Caddy Saved After The Migration",
      description: "Post-migration product.",
      identifyingAttributeKeys: ["color"],
      status: "active",
    };
    await adapter.products.save(newProduct);
    const newSku: Sku = {
      id: "new-sku-1",
      productId: "new-product-1",
      identifyingAttributes: [{ key: "color", value: "brown" }],
      price: { amount: 1999, currency: "USD" },
      status: "active",
      availabilityStatus: "request",
      availabilityNote: "Special order, 2-3 week lead time.",
    };
    await adapter.skus.save(newSku);
    const found = await adapter.skus.get("new-sku-1");
    expect(found?.availabilityStatus).toBe("request");
    expect(found?.availabilityNote).toBe("Special order, 2-3 week lead time.");
  });
});
