#!/usr/bin/env node
import { backupSqliteDatabase, restoreSqliteBackup } from "./backup-restore.js";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  mercatus-liber-sqlite-backup backup <db-file-path> [backup-dir]",
      "  mercatus-liber-sqlite-backup restore <backup-file-path> <target-db-file-path>",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "backup") {
    const [dbFilePath, backupDir] = args;
    if (!dbFilePath) usage();
    const destination = await backupSqliteDatabase(dbFilePath, backupDir);
    console.log(`Backup written to ${destination}`);
    return;
  }

  if (command === "restore") {
    const [backupFilePath, targetDbFilePath] = args;
    if (!backupFilePath || !targetDbFilePath) usage();
    await restoreSqliteBackup(backupFilePath, targetDbFilePath);
    console.log(`Restored ${backupFilePath} -> ${targetDbFilePath}`);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
