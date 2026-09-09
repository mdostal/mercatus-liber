/**
 * backup-restore-01: real round-trip proof for the backup/restore acceptance
 * criteria in .pHive/epics/data-backup-restore-and-adapter-portability/
 * stories/backup-restore-01-persistence-wiring-and-backup-restore.yaml --
 * not just "the command ran", but that the resulting backup file is a
 * genuinely valid, independently-openable SQLite database containing the
 * real seeded data, and that restoring it into a fresh path reproduces the
 * exact same data.
 *
 * The source adapter's own connection is deliberately kept open for the
 * whole backup call (never closed before backupSqliteDatabase runs) to
 * exercise the actual scenario this exists for: backing up a database
 * that's live and open, the way a running server's would be.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Product, ProductAttribute, Sku } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupSqliteDatabase, restoreSqliteBackup } from "../src/backup-restore.js";
import { createSqliteAdapter } from "../src/index.js";

describe("SQLite backup/restore", () => {
  let tmpDir: string;
  let dbFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-sqlite-backup-test-"));
    dbFilePath = path.join(tmpDir, "catalog.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const dragon: Product = {
    id: "p1",
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A cable organizer.",
    identifyingAttributeKeys: ["color"],
    status: "active",
  };
  const dragonSku: Sku = {
    id: "s1",
    productId: "p1",
    identifyingAttributes: [{ key: "color", value: "red" }],
    price: { amount: 1999, currency: "USD" },
    status: "active",
  };
  const materialsAttr: ProductAttribute = {
    productId: "p1",
    key: "materials",
    value: ["PLA", "PETG"],
    facetable: false,
  };

  it("backs up real seeded data from a live, open database into a genuinely valid, independently-openable backup file, and restores it byte-for-byte into a fresh target", async () => {
    // Real file-backed adapter, real seeded data -- and its connection is
    // never closed before/around the backup call below.
    const liveAdapter = createSqliteAdapter(dbFilePath);
    await liveAdapter.products.save(dragon);
    await liveAdapter.skus.save(dragonSku);
    await liveAdapter.attributes.save(materialsAttr);

    expect(fs.existsSync(dbFilePath)).toBe(true);

    const backupDir = path.join(tmpDir, "backups");
    const backupPath = await backupSqliteDatabase(dbFilePath, backupDir);

    expect(fs.existsSync(backupPath)).toBe(true);
    expect(path.dirname(backupPath)).toBe(backupDir);

    // Independently open the backup file with a brand-new connection that
    // has nothing to do with liveAdapter's, and query it directly to prove
    // it's a real, valid, non-corrupted SQLite database with the real data.
    const rawBackup = new Database(backupPath, { readonly: true });
    try {
      const productRows = rawBackup.prepare("SELECT * FROM products").all() as Array<{ id: string; slug: string }>;
      expect(productRows).toHaveLength(1);
      expect(productRows[0]?.id).toBe("p1");
      expect(productRows[0]?.slug).toBe("dragon-cable-organizer");

      const skuRows = rawBackup.prepare("SELECT * FROM skus").all() as Array<{ id: string }>;
      expect(skuRows).toHaveLength(1);
      expect(skuRows[0]?.id).toBe("s1");
    } finally {
      rawBackup.close();
    }

    // Restore into a fresh target path and confirm the restored adapter
    // returns the exact same real data as the live original.
    const restoredPath = path.join(tmpDir, "restored.db");
    await restoreSqliteBackup(backupPath, restoredPath);
    expect(fs.existsSync(restoredPath)).toBe(true);

    const restoredAdapter = createSqliteAdapter(restoredPath);
    expect(await restoredAdapter.products.get("p1")).toEqual(dragon);
    expect(await restoredAdapter.skus.get("s1")).toEqual(dragonSku);
    expect(await restoredAdapter.attributes.listByProduct("p1")).toEqual([materialsAttr]);
  });

  it("defaults the backup directory to '<db-dir>/backups' when none is given", async () => {
    const adapter = createSqliteAdapter(dbFilePath);
    await adapter.products.save(dragon);

    const backupPath = await backupSqliteDatabase(dbFilePath);
    expect(path.dirname(backupPath)).toBe(path.join(tmpDir, "backups"));
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it("throws a clear error when the source database file does not exist", async () => {
    await expect(backupSqliteDatabase(path.join(tmpDir, "nope.db"))).rejects.toThrow(/does not exist/i);
  });

  it("throws a clear error when the backup file to restore from does not exist", async () => {
    await expect(
      restoreSqliteBackup(path.join(tmpDir, "nope.bak"), path.join(tmpDir, "target.db")),
    ).rejects.toThrow(/does not exist/i);
  });

  it("refuses to restore into a target path that already exists, rather than silently overwriting it", async () => {
    const adapter = createSqliteAdapter(dbFilePath);
    await adapter.products.save(dragon);
    const backupPath = await backupSqliteDatabase(dbFilePath, path.join(tmpDir, "backups"));

    const existingTarget = path.join(tmpDir, "already-there.db");
    fs.writeFileSync(existingTarget, "not a real database file");

    await expect(restoreSqliteBackup(backupPath, existingTarget)).rejects.toThrow(/already exists/i);
  });
});
