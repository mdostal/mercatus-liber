import type { StoreManifest } from "@mercatus-liber/create-store";
import type { RegistryClient } from "./registry-client.js";

export interface UpdateEntry {
  packageName: string;
  fromVersion: string;
  toVersion: string;
}

export interface UpdateReport {
  updates: UpdateEntry[];
}

function stripRange(version: string): string {
  return version.replace(/^[\^~]/, "");
}

function parseVersion(v: string): [number, number, number] {
  const [major, minor, patch] = v.split(".").map((n) => Number.parseInt(n, 10));
  return [major ?? 0, minor ?? 0, patch ?? 0];
}

/** Standard major.minor.patch comparison only -- no pre-release tag handling, a deliberate scope simplification (see this epic's docs/deploy-tool-scope.md). */
function isNewer(candidate: string, current: string): boolean {
  const [cMaj, cMin, cPat] = parseVersion(candidate);
  const [xMaj, xMin, xPat] = parseVersion(current);
  if (cMaj !== xMaj) return cMaj > xMaj;
  if (cMin !== xMin) return cMin > xMin;
  return cPat > xPat;
}

/** Checks every @mercatus-liber/* package the manifest lists -- non-framework dependencies (e.g. "pg") are out of scope for this tool. */
export async function checkForUpdates(manifest: StoreManifest, registry: RegistryClient): Promise<UpdateReport> {
  const updates: UpdateEntry[] = [];

  for (const [packageName, versionRange] of Object.entries(manifest.packageVersions)) {
    if (!packageName.startsWith("@mercatus-liber/")) continue;
    const latest = await registry.getLatestVersion(packageName);
    const current = stripRange(versionRange);
    if (isNewer(latest, current)) {
      updates.push({ packageName, fromVersion: versionRange, toVersion: latest });
    }
  }

  return { updates };
}
