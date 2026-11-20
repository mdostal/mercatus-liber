import type { Sku } from "@mercatus-liber/core";
import type { ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import type { PrintfulCatalogCategory, PrintfulCatalogListing } from "./catalog.js";
import { PRINTFUL_PROVIDER } from "./provider.js";

/**
 * Which Printful catalog products a store already sells, as
 * `{ printfulProductId -> store product ids }`.
 *
 * Read from the store's Printful mappings, joined through its own SKUs so a
 * store sharing a database with others (the reference storefront's demos)
 * sees only its own: pass `productIds` to keep only those store products.
 * Mappings saved before applyPrintfulProduct recorded `catalogProductId` are
 * resolved through `variantProductId` (the catalog client's getVariant), or
 * skipped without it.
 */
export async function printfulProductsInStore(deps: {
  mappings: ProviderCatalogMappingRepository;
  getSku(skuId: string): Promise<Sku | null>;
  productIds?: Iterable<string>;
  variantProductId?: (variantId: number) => Promise<number | null>;
}): Promise<Map<number, string[]>> {
  const keep = deps.productIds ? new Set(deps.productIds) : null;
  const found = new Map<number, Set<string>>();
  const variantCache = new Map<number, number | null>();
  for (const mapping of await deps.mappings.list(PRINTFUL_PROVIDER)) {
    const sku = await deps.getSku(mapping.skuId);
    if (!sku || (keep && !keep.has(sku.productId))) continue;
    const target = mapping.target as { catalogProductId?: unknown; catalogVariantId?: unknown };
    let printfulId = typeof target.catalogProductId === "number" ? target.catalogProductId : null;
    if (printfulId === null && typeof target.catalogVariantId === "number" && deps.variantProductId) {
      if (!variantCache.has(target.catalogVariantId)) variantCache.set(target.catalogVariantId, await deps.variantProductId(target.catalogVariantId));
      printfulId = variantCache.get(target.catalogVariantId) ?? null;
    }
    if (printfulId === null) continue;
    const products = found.get(printfulId) ?? new Set<string>();
    products.add(sku.productId);
    found.set(printfulId, products);
  }
  return new Map([...found].map(([id, products]) => [id, [...products]]));
}

/** The whole Printful catalog listing at one moment, as a store might save it. */
export interface PrintfulCatalogSnapshot {
  /** ISO timestamp the listing was read from Printful. */
  fetchedAt: string;
  products: PrintfulCatalogListing[];
  categories: PrintfulCatalogCategory[];
}

export interface PrintfulCatalogCache {
  /** The listing, from memory, the saved copy or Printful, in that order, refreshing when older than ttlMs. */
  get(): Promise<PrintfulCatalogSnapshot>;
  /** Reads Printful again now. */
  refresh(): Promise<PrintfulCatalogSnapshot>;
}

/**
 * Keeps Printful's catalog listing (about 6 requests for all of it) so
 * browsing doesn't call Printful on every page view; v2 allows 120 requests a
 * minute. Memory is per server instance; pass `load`/`save` to keep a copy
 * somewhere durable (a database row, a file, a committed JSON snapshot).
 * Without `fetch` it serves only what `load` returns, which is how a store
 * with no Printful token can still browse a saved snapshot. When reading
 * Printful fails, a stale copy is served if there is one.
 */
export function createPrintfulCatalogCache(options: {
  fetch?: () => Promise<{ products: PrintfulCatalogListing[]; categories: PrintfulCatalogCategory[] }>;
  load?: () => Promise<PrintfulCatalogSnapshot | null>;
  save?: (snapshot: PrintfulCatalogSnapshot) => Promise<void>;
  /** Default 24 hours. */
  ttlMs?: number;
  now?: () => Date;
}): PrintfulCatalogCache {
  const ttl = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? (() => new Date());
  let memory: PrintfulCatalogSnapshot | null = null;
  let inFlight: Promise<PrintfulCatalogSnapshot> | null = null;
  const fresh = (s: PrintfulCatalogSnapshot | null) => s !== null && now().getTime() - Date.parse(s.fetchedAt) < ttl;

  async function refresh(): Promise<PrintfulCatalogSnapshot> {
    if (!options.fetch) {
      const saved = await options.load?.();
      if (!saved) throw new Error("No Printful catalog: there is no saved snapshot and no Printful token to read one.");
      memory = saved;
      return saved;
    }
    inFlight ??= (async () => {
      try {
        const { products, categories } = await options.fetch!();
        const snapshot: PrintfulCatalogSnapshot = { fetchedAt: now().toISOString(), products, categories };
        memory = snapshot;
        await options.save?.(snapshot);
        return snapshot;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    async get() {
      if (fresh(memory)) return memory!;
      if (!memory && options.load) memory = (await options.load()) ?? null;
      if (fresh(memory) || (memory && !options.fetch)) return memory!;
      try {
        return await refresh();
      } catch (err) {
        // A stale copy beats no catalog when Printful is down or rate limited.
        if (memory) return memory;
        throw err;
      }
    },
    refresh,
  };
}

export interface PrintfulCatalogFilter {
  /** Matched against name, brand, model and type, case-insensitively; every word must match. */
  search?: string;
  /** A category and every category under it. */
  categoryId?: number;
  technique?: string;
  placement?: string;
  /** Include products Printful has discontinued. Default false. */
  includeDiscontinued?: boolean;
}

/** Filters a listing in memory, for searching a cached catalog without calling Printful. */
export function filterPrintfulCatalog(snapshot: Pick<PrintfulCatalogSnapshot, "products" | "categories">, filter: PrintfulCatalogFilter): PrintfulCatalogListing[] {
  const words = (filter.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const categories = filter.categoryId !== undefined ? categoryAndDescendants(snapshot.categories, filter.categoryId) : null;
  return snapshot.products.filter((p) => {
    if (!filter.includeDiscontinued && p.is_discontinued) return false;
    if (categories && !categories.has(p.main_category_id)) return false;
    if (filter.technique && !p.techniques.some((t) => t.key === filter.technique)) return false;
    if (filter.placement && !p.placements.some((pl) => pl.placement === filter.placement)) return false;
    if (words.length) {
      const haystack = [p.name, p.brand ?? "", p.model ?? "", p.type].join(" ").toLowerCase();
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    return true;
  });
}

function categoryAndDescendants(categories: PrintfulCatalogCategory[], rootId: number): Set<number> {
  const ids = new Set([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of categories) {
      if (c.parent_id !== null && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}
