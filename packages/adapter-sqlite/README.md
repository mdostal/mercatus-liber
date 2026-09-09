# @mercatus-liber/adapter-sqlite

Reference persistence adapter backed by SQLite (`better-sqlite3`). Implements
`@mercatus-liber/core`'s `CatalogPersistenceAdapter` interface -- its public surface (from
`createSqliteAdapter(path)`) is exactly that interface, no SQLite-specific type leaks out. Chosen
as the first reference adapter for lowest local-dev friction (no external DB service required);
`@mercatus-liber/adapter-postgres` proves the same contract with a second backend.

`createSqliteAdapter(path)` accepts any path SQLite's own API accepts, including `":memory:"`
(ephemeral, used by default when no persistence env var is configured -- see
`apps/reference-storefront/lib/services.ts`) or a real file path (durable across restarts, sets
`journal_mode = WAL` on the connection).

## Backup and restore

A durable, file-backed database (created via a real file path instead of `":memory:"`) can be
backed up and restored with this package's CLI script. Both commands use SQLite's own **Online
Backup API** (bound by `better-sqlite3`'s native `.backup()` method), not a raw filesystem copy --
see `src/backup-restore.ts`'s doc comment for exactly why a plain `cp`/`fs.copyFile` of a live
database file is unsafe (torn pages, and WAL-mode `-wal`/`-shm` sidecar files a naive copy would
miss). The Online Backup API is SQLite's own answer to this problem: it copies page-by-page and
re-copies any page that changes mid-backup, so it produces a valid, consistent copy even while a
real server process has the same file open and is actively writing to it.

### Usage

From a checkout of this monorepo (not yet published to npm, so `npx mercatus-liber-sqlite-backup`
does not work today):

```
pnpm --filter @mercatus-liber/adapter-sqlite build
node packages/adapter-sqlite/dist/cli.js backup <db-file-path> [backup-dir]
node packages/adapter-sqlite/dist/cli.js restore <backup-file-path> <target-db-file-path>
```

**`backup <db-file-path> [backup-dir]`** -- produces a real, valid, independently-openable copy of
the live database at `<db-file-path>`, written to a new timestamped file
(`<filename>.<ISO-timestamp-with-safe-separators>.bak`) inside `[backup-dir]`. Defaults
`[backup-dir]` to a `backups/` directory next to `<db-file-path>` when omitted. Prints the full
path of the backup file it created. Fails clearly if `<db-file-path>` does not exist.

```
node packages/adapter-sqlite/dist/cli.js backup ./data/catalog.db
# Backup written to ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak

node packages/adapter-sqlite/dist/cli.js backup ./data/catalog.db ./offsite-backups
# Backup written to ./offsite-backups/catalog.db.2026-09-09T12-34-56-789Z.bak
```

**`restore <backup-file-path> <target-db-file-path>`** -- restores a backup produced by `backup`
into `<target-db-file-path>`, using the same Online Backup API mechanism. Refuses to run (and
exits non-zero) if `<target-db-file-path>` already exists, so a restore can never silently
overwrite an existing database -- remove/rename the existing file first, or restore to a fresh
path and swap it into place yourself once you've confirmed it's what you want.

```
node packages/adapter-sqlite/dist/cli.js restore ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak ./data/catalog.restored.db
# Restored ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak -> ./data/catalog.restored.db
```

Both commands are also available as plain, directly-importable functions
(`backupSqliteDatabase`/`restoreSqliteBackup` from `src/backup-restore.ts`) for programmatic use
or testing -- see `test/backup-restore.test.ts` for a full seed → backup → independently-verify →
restore → verify round trip against real data.

### Scope: SQLite only

Backup/restore here is deliberately scoped to this adapter -- the actual zero-infra default every
demo uses today -- not a universal serialization layer across every adapter this repo ships.
Postgres and Shopify-backed deployments already have their own mature, real backup tooling
(`pg_dump`/`pg_restore`; Shopify's own data export); reinventing a worse version of that here
would contradict the adapter-agnostic philosophy this repo follows elsewhere. See
`.pHive/epics/data-backup-restore-and-adapter-portability/docs/design-discussion.md` §1b for the
full reasoning.
