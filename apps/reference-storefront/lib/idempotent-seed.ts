import type { Catalog, CatalogService, NewCatalogInput, NewProductInput } from "@mercatus-liber/catalog";
import type { Category, MarketingCatalogService, NewCategoryInput } from "@mercatus-liber/marketing-catalog";
import type { Product } from "@mercatus-liber/core";

/**
 * demo-seed-idempotency epic (48): real fix, found live and confirmed
 * necessary the moment real shared persistence went live for the first
 * time. `catalog.createProduct()`/`marketingCatalog.createCategory()` were
 * always called unconditionally by every demo's seed function -- harmless
 * under the in-memory default (each demo's own fresh Map-backed instance,
 * wiped on every restart, so a second call never actually happens against
 * existing data), but a real crash under any real shared persisted backend
 * (Postgres/MongoDB/Convex/Sanity): a Vercel serverless COLD START re-runs
 * a demo's whole seed function from scratch (the in-process
 * `servicesByDemo` memoization in lib/services.ts only survives warm
 * invocations of the SAME instance, never a fresh one), so under real
 * production traffic with multiple concurrent instances, more than one
 * instance can genuinely race to seed the same demo's catalog against the
 * same shared table -- the second one hits a real UNIQUE constraint
 * violation on the product/category's own slug and crashes, unhandled,
 * permanently bricking that demo until the process is restarted again.
 *
 * Fixed the simplest correct way: check-by-slug before create, for every
 * product/category a seed function creates. Confirmed safe even under a
 * SHARED database across all 3 demo stores (not just repeated runs of the
 * SAME demo) -- a real audit of this session's actual seed data found
 * every product/category/location/campaign slug already globally unique
 * across all 3 stores, so this lookup can never accidentally return
 * another store's own product/category.
 */

/**
 * Reports `isNew` alongside the product so a caller can also skip
 * re-generating SKUs/stock/category-assignments for a product that already
 * existed -- those aren't gated by any unique constraint the way
 * slug-uniqueness is, so they'd never crash on a re-run, but they WOULD
 * silently duplicate (a second, redundant set of SKUs for the same
 * product) without this signal.
 */
export async function upsertProduct(
  catalog: CatalogService,
  input: NewProductInput,
): Promise<{ product: Product; isNew: boolean }> {
  const existing = await catalog.getProductBySlug(input.slug);
  if (existing) return { product: existing, isNew: false };
  return { product: await catalog.createProduct(input), isNew: true };
}

export async function upsertCategory(marketingCatalog: MarketingCatalogService, input: NewCategoryInput): Promise<Category> {
  const existing = await marketingCatalog.getCategoryBySlug(input.slug);
  if (existing) return existing;
  return marketingCatalog.createCategory(input);
}

/**
 * full-commerce-persistence-audit epic: same idempotent-by-slug precedent as
 * upsertCategory above, for the real, named Catalog entity each demo store
 * gets exactly one of (see @mercatus-liber/catalog's catalog-entity.ts doc
 * comment). Every one of a demo's real seeded products is assigned to this
 * one Catalog via CatalogService.assignProductToCatalog -- assignment itself
 * is separately idempotent (a Set/ON CONFLICT DO NOTHING under the hood, see
 * each ProductCatalogRepository implementation), so callers don't need an
 * isNew signal the way upsertProduct's callers do.
 */
export async function upsertCatalog(catalog: CatalogService, input: NewCatalogInput): Promise<Catalog> {
  const existing = await catalog.getCatalogBySlug(input.slug);
  if (existing) return existing;
  return catalog.createCatalog(input);
}
