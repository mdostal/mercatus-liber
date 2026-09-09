import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Real, safe SQLite backup/restore for the file-backed adapter this package
 * exports (see index.ts's createSqliteAdapter). Kept as its own module (not
 * folded into index.ts, and not re-exported from the package's public
 * `.` entry point) so index.ts's own doc comment -- "public surface is
 * exactly the CatalogPersistenceAdapter interface" -- stays true; this is
 * operator/CLI tooling around that adapter, not part of it. See cli.ts for
 * the command-line wrapper and this package's README.md for usage.
 *
 * Both directions use better-sqlite3's native `.backup()` method, a direct
 * binding to SQLite's own Online Backup API
 * (sqlite3_backup_init/step/finish). This is the mechanism SQLite itself
 * ships specifically to produce a consistent, restorable copy of a *live*,
 * open database -- it copies page-by-page and re-copies any page that
 * changes mid-backup, so it stays correct even while a real server process
 * has the same file open and is actively writing to it (the exact
 * situation an operator taking a backup is in).
 *
 * A raw filesystem copy (`cp`, `fs.copyFile`) is NOT used here and must
 * not be used: SQLite does not write a database file atomically as a
 * single unit, and in the WAL mode this adapter enables
 * (`journal_mode = WAL`, see index.ts), committed-but-not-yet-checkpointed
 * data lives in a separate `-wal` sidecar file plus a `-shm` shared-memory
 * index file alongside the main file. A plain file copy of just the main
 * `.db` file can silently miss that data entirely, or copy the main file
 * mid-write and produce a torn page -- a corrupted copy that may not fail
 * until someone actually tries to restore it. The Online Backup API reads
 * through SQLite's own page cache/WAL-aware machinery, so none of that
 * applies.
 */

/** Filesystem-safe timestamp, e.g. "2026-09-09T12-34-56-789Z". */
function timestampSuffix(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Produces a real, valid, independently-openable backup of the live SQLite
 * database at `dbFilePath`, written to a new timestamped file inside
 * `backupDir` (default: a `backups` directory next to the source file).
 * Returns the full path to the backup file it created.
 *
 * Opens its own, separate connection to `dbFilePath` -- it does not require
 * (and does not disturb) any existing connection/process that already has
 * the file open, which is the normal case for a live server.
 */
export async function backupSqliteDatabase(dbFilePath: string, backupDir?: string): Promise<string> {
  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Source database file does not exist: ${dbFilePath}`);
  }

  const dir = backupDir ?? path.join(path.dirname(dbFilePath), "backups");
  fs.mkdirSync(dir, { recursive: true });

  const destination = path.join(dir, `${path.basename(dbFilePath)}.${timestampSuffix(new Date())}.bak`);

  const source = new Database(dbFilePath, { readonly: true });
  try {
    await source.backup(destination);
  } finally {
    source.close();
  }

  return destination;
}

/**
 * Restores a backup produced by `backupSqliteDatabase` into `targetDbFilePath`.
 * Refuses to run if `targetDbFilePath` already exists, so a restore can
 * never silently clobber an existing database -- remove/rename it first, or
 * pass a fresh path, exactly like the acceptance criteria this covers
 * ("restores ... into a fresh target path").
 *
 * Uses the same Online Backup API as backupSqliteDatabase, in reverse: the
 * backup file (itself a real, closed, consistent SQLite database) is opened
 * as the source and materialized at the target path.
 */
export async function restoreSqliteBackup(backupFilePath: string, targetDbFilePath: string): Promise<void> {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist: ${backupFilePath}`);
  }
  if (fs.existsSync(targetDbFilePath)) {
    throw new Error(
      `Target path already exists: ${targetDbFilePath} -- refusing to overwrite an existing database. Remove it first or choose a fresh target path.`,
    );
  }

  fs.mkdirSync(path.dirname(path.resolve(targetDbFilePath)), { recursive: true });

  const source = new Database(backupFilePath, { readonly: true });
  try {
    await source.backup(targetDbFilePath);
  } finally {
    source.close();
  }
}
