/**
 * Injectable registry client -- mirrors adapter-shopify's injectable-fetch
 * GraphQL client pattern. These packages are not yet published to npm (see
 * this epic's docs/deploy-tool-scope.md), so createNpmRegistryClient is
 * real, written, and tested against a recording fake -- not a live
 * integration test. It will start resolving real versions the moment these
 * packages are published.
 */
export interface RegistryClient {
  getLatestVersion(packageName: string): Promise<string>;
}

export class PackageNotFoundError extends Error {
  constructor(packageName: string) {
    super(`Package not found in registry: ${packageName}`);
    this.name = "PackageNotFoundError";
  }
}

export function createNpmRegistryClient(fetchImpl: typeof fetch = fetch): RegistryClient {
  return {
    async getLatestVersion(packageName: string): Promise<string> {
      const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
      if (response.status === 404) throw new PackageNotFoundError(packageName);
      const json = (await response.json()) as { version: string };
      return json.version;
    },
  };
}
