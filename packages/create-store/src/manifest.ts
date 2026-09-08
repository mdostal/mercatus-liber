/**
 * The manifest a scaffolded store carries alongside its code -- the
 * substrate @mercatus-liber/auto-update reads to know what's installed and
 * what to check for updates. See
 * .pHive/epics/deploy-tool-and-auto-update/docs/deploy-tool-scope.md.
 */
export type AdapterChoice = "sqlite" | "postgres" | "shopify";

export interface StoreManifest {
  storeName: string;
  adapter: AdapterChoice;
  theme: string;
  plugins: string[];
  /** Package name -> installed version range, e.g. { "@mercatus-liber/core": "^0.1.0" }. */
  packageVersions: Record<string, string>;
  /** ISO 8601 timestamp of when this manifest was last written (scaffold or update). */
  generatedAt: string;
}

export const MANIFEST_FILENAME = "mercatus-liber.config.json";

export function serializeManifest(manifest: StoreManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseManifest(json: string): StoreManifest {
  return JSON.parse(json) as StoreManifest;
}
