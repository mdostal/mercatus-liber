import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILENAME, parseManifest, serializeManifest } from "@mercatus-liber/create-store";
import type { UpdateEntry, UpdateReport } from "./check-updates.js";

export interface ApplyUpdatesOptions {
  /** The safety gate: applyUpdates only keeps a version bump if this resolves true. Real CLI usage shells out to `pnpm test`; tests inject a fake. */
  runTests: (targetDir: string) => Promise<boolean>;
}

export interface ApplyResult {
  applied: boolean;
  updates: UpdateEntry[];
}

/**
 * Test-gated apply-or-rollback -- the "safe for unattended maintenance"
 * property the commercial thesis depends on (see this epic's
 * docs/deploy-tool-scope.md). Writes the version bump to package.json and
 * the manifest, runs the caller's test gate, and restores both files to
 * their exact original content if it fails. All-or-nothing: never leaves
 * a partially-applied update behind.
 */
export async function applyUpdates(targetDir: string, report: UpdateReport, options: ApplyUpdatesOptions): Promise<ApplyResult> {
  if (report.updates.length === 0) return { applied: false, updates: [] };

  const packageJsonPath = path.join(targetDir, "package.json");
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);

  const originalPackageJsonRaw = await readFile(packageJsonPath, "utf8");
  const originalManifestRaw = await readFile(manifestPath, "utf8");

  const packageJson = JSON.parse(originalPackageJsonRaw) as { dependencies?: Record<string, string> };
  const manifest = parseManifest(originalManifestRaw);

  for (const update of report.updates) {
    const newRange = `^${update.toVersion}`;
    if (packageJson.dependencies?.[update.packageName]) packageJson.dependencies[update.packageName] = newRange;
    manifest.packageVersions[update.packageName] = newRange;
  }
  manifest.generatedAt = new Date().toISOString();

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await writeFile(manifestPath, serializeManifest(manifest), "utf8");

  const testsPassed = await options.runTests(targetDir);
  if (!testsPassed) {
    await writeFile(packageJsonPath, originalPackageJsonRaw, "utf8");
    await writeFile(manifestPath, originalManifestRaw, "utf8");
    return { applied: false, updates: report.updates };
  }

  return { applied: true, updates: report.updates };
}
