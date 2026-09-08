import type { Bundle, BundleRepository } from "./types.js";

/**
 * Default in-memory BundleRepository -- structured exactly like the cart and
 * promotions subsystems' own in-memory repositories (Map-backed,
 * structuredClone in/out so callers can never mutate stored state through a
 * returned reference). A durable adapter (e.g. sqlite) is a later, separate
 * concern -- not required for this reference default.
 */
export function createInMemoryBundleRepository(): BundleRepository {
  const bundles = new Map<string, Bundle>();
  return {
    async get(id: string): Promise<Bundle | null> {
      const bundle = bundles.get(id);
      return bundle ? structuredClone(bundle) : null;
    },
    async list(): Promise<Bundle[]> {
      return Array.from(bundles.values()).map((bundle) => structuredClone(bundle));
    },
    async save(bundle: Bundle): Promise<void> {
      bundles.set(bundle.id, structuredClone(bundle));
    },
  };
}
