#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { MANIFEST_FILENAME, parseManifest } from "@mercatus-liber/create-store";
import { applyUpdates } from "./apply-update.js";
import { checkForUpdates } from "./check-updates.js";
import { createNpmRegistryClient } from "./registry-client.js";

const execFileAsync = promisify(execFile);

async function defaultRunTests(targetDir: string): Promise<boolean> {
  try {
    await execFileAsync("pnpm", ["test"], { cwd: targetDir });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const targetDir = args.find((a) => !a.startsWith("--")) ?? process.cwd();

  const manifest = parseManifest(await readFile(path.join(targetDir, MANIFEST_FILENAME), "utf8"));
  const registry = createNpmRegistryClient();
  const report = await checkForUpdates(manifest, registry);

  if (report.updates.length === 0) {
    console.log("Up to date.");
    return;
  }

  console.log(`${report.updates.length} update(s) available:`);
  for (const update of report.updates) console.log(`  ${update.packageName}: ${update.fromVersion} -> ${update.toVersion}`);

  if (!apply) {
    console.log("Re-run with --apply to update (test-gated -- rolled back automatically if tests fail).");
    return;
  }

  const result = await applyUpdates(targetDir, report, { runTests: defaultRunTests });
  console.log(result.applied ? "Updates applied -- tests passed." : "Update rolled back -- tests failed after applying.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
