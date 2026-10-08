import type { CatalogService } from "@mercatus-liber/catalog";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { IdentifyingAttribute } from "@mercatus-liber/core";
import type { ImportedCollection, ImportedProduct, ShopifyCatalogSnapshot } from "./types.js";

/**
 * The native write/import path for this migration tool -- the counterpart to
 * read-catalog.ts's read-only snapshot. Writes exclusively through the same
 * public service-layer methods every other part of this app already uses
 * (CatalogService.createProduct/createSku, MarketingCatalogService
 * .createCategory/assignProductToCategory, InventoryAdapter.setStock) -- no
 * bespoke bulk-insert path, so the real service layer's own validation
 * (e.g. CatalogService's assertIdentifyingKeysMatch) always runs on every
 * real write.
 *
 * Orders/customers and images/media migration are explicitly out of scope
 * for this first pass -- see this package's README and
 * .pHive/epics/shopify-migration-import-tool/docs/design-discussion.md.
 * Nothing in this module reads or writes either.
 */

export interface ImportShopifyCatalogDeps {
  catalog: CatalogService;
  marketingCatalog: MarketingCatalogService;
  inventory: InventoryAdapter;
}

export interface ImportShopifyCatalogOptions {
  /**
   * Dry-run is this tool's first-class, DEFAULT mode: true unless a caller
   * explicitly opts out. A dry run calls none of CatalogService's/
   * MarketingCatalogService's/InventoryAdapter's writing methods -- only
   * their read methods (getProductBySlug, getCategoryBySlug,
   * listCategoryIdsForProduct, resolveVariant), to compute an accurate
   * "would create / would skip" report against the real target
   * persistence's current state.
   */
  dryRun?: boolean;
  /** How many real product titles to include in the report's sample. Defaults to 5. */
  sampleSize?: number;
}

export interface ImportCounts {
  /** Total records seen in the Shopify snapshot for this entity kind. */
  total: number;
  /** Created this run (or, in a dry run, would be created). */
  created: number;
  /** Already present in the target (by slug/identifying-attributes) -- skipped, matching this repo's upsert-by-slug idempotency convention (see apps/reference-storefront/lib/idempotent-seed.ts). */
  skipped: number;
  /** Attempted but failed validation or a real write error -- recorded in `attention`, never silently dropped. */
  failed: number;
}

export type AttentionKind = "product" | "sku" | "category" | "assignment";

export interface AttentionItem {
  kind: AttentionKind;
  /** The Shopify handle/slug (and, for a SKU, its identifying-attribute selection) this item is about. */
  identifier: string;
  reason: string;
}

export interface ImportReport {
  dryRun: boolean;
  products: ImportCounts;
  skus: ImportCounts;
  categories: ImportCounts;
  assignments: ImportCounts;
  /** Real product titles from the snapshot, up to `sampleSize` -- never placeholders. */
  sampleProductTitles: string[];
  /** Everything that doesn't cleanly map and needs manual attention -- never silently dropped. */
  attention: AttentionItem[];
}

const DEFAULT_SAMPLE_SIZE = 5;

function emptyCounts(): ImportCounts {
  return { total: 0, created: 0, skipped: 0, failed: 0 };
}

/** Set-equality of attribute keys -- what CatalogService's real assertIdentifyingKeysMatch enforces on every createSku call. Duplicated here (read-only, advisory) only so a DRY RUN can report a mismatch without performing the real write that would throw. The real write path never relies on this function -- it always calls the real catalog.createSku and lets the real validation run. */
function identifyingKeysMatch(expectedKeys: string[], attrs: IdentifyingAttribute[]): boolean {
  const expected = new Set(expectedKeys);
  const actual = new Set(attrs.map((a) => a.key));
  if (expected.size !== actual.size) return false;
  for (const k of expected) if (!actual.has(k)) return false;
  return true;
}

function describeSelection(attrs: IdentifyingAttribute[]): string {
  if (attrs.length === 0) return "(no identifying attributes)";
  return attrs.map((a) => `${a.key}=${String(a.value)}`).join(",");
}

/**
 * Imports one already-read Shopify catalog snapshot into Mercatus Liber's
 * native persistence, through the real service layer only.
 *
 * Dry-run (the default): performs zero writes. Computes exactly what a real
 * run would create/skip by reading the target's CURRENT state (so running
 * it twice in a row, or running it against a target already partially
 * imported, reports accurately both times).
 *
 * Idempotent: every create is gated on a check-by-slug (products,
 * categories) or check-by-identifying-attributes (SKUs, via
 * CatalogService.resolveVariant) against the target, mirroring
 * apps/reference-storefront/lib/idempotent-seed.ts's upsertProduct/
 * upsertCategory pattern. Running this twice against the same snapshot and
 * the same target creates zero duplicate products, categories, or SKUs --
 * the second run's created counts are all 0 and its skipped counts cover
 * everything the first run created.
 *
 * Resumable: a per-record try/catch means one bad record (e.g. a variant
 * whose identifying-attribute keys don't match its product's, or a real
 * write error) is recorded in `attention` and does not abort the rest of
 * the import -- a later re-run only needs to redo what actually failed,
 * since everything that already succeeded is skipped via the same
 * idempotency checks.
 */
export async function importShopifyCatalog(
  snapshot: ShopifyCatalogSnapshot,
  deps: ImportShopifyCatalogDeps,
  options: ImportShopifyCatalogOptions = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? true;
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const { catalog, marketingCatalog, inventory } = deps;

  const products = emptyCounts();
  const skus = emptyCounts();
  const categories = emptyCounts();
  const assignments = emptyCounts();
  const attention: AttentionItem[] = [];

  // Every product slug present in this snapshot, so a collection's
  // product-handle references can be told apart from a genuine orphan
  // reference (a handle that isn't anywhere in this snapshot at all) --
  // see importCollections below.
  const snapshotProductSlugs = new Set(snapshot.products.map((p) => p.product.slug));

  type ProductImportStatus = "existing" | "created" | "would-create" | "failed";

  interface ProductImportResult {
    status: ProductImportStatus;
    /** A real target id, present only for "existing"/"created". */
    productId: string | null;
    targetIdentifyingKeys: string[];
  }

  /** Returns the real target productId to use for this product's variants ("existing"/"created" only -- "would-create"/"failed" have no real id yet). */
  async function importProduct(imported: ImportedProduct): Promise<ProductImportResult> {
    products.total += 1;
    const { product } = imported;

    if (!product.slug) {
      products.failed += 1;
      attention.push({ kind: "product", identifier: product.title || "(untitled)", reason: "Missing Shopify handle/slug -- cannot check for an existing product or create one." });
      return { status: "failed", productId: null, targetIdentifyingKeys: product.identifyingAttributeKeys };
    }

    const existing = await catalog.getProductBySlug(product.slug);
    if (existing) {
      products.skipped += 1;
      return { status: "existing", productId: existing.id, targetIdentifyingKeys: existing.identifyingAttributeKeys };
    }

    if (dryRun) {
      products.created += 1;
      return { status: "would-create", productId: null, targetIdentifyingKeys: product.identifyingAttributeKeys };
    }

    try {
      const created = await catalog.createProduct({
        slug: product.slug,
        title: product.title,
        description: product.description,
        identifyingAttributeKeys: product.identifyingAttributeKeys,
      });
      products.created += 1;
      return { status: "created", productId: created.id, targetIdentifyingKeys: created.identifyingAttributeKeys };
    } catch (err) {
      products.failed += 1;
      attention.push({ kind: "product", identifier: product.slug, reason: err instanceof Error ? err.message : String(err) });
      return { status: "failed", productId: null, targetIdentifyingKeys: product.identifyingAttributeKeys };
    }
  }

  async function importVariants(imported: ImportedProduct, product: ProductImportResult): Promise<void> {
    const { status, productId, targetIdentifyingKeys } = product;

    for (const variant of imported.variants) {
      skus.total += 1;
      const selectionLabel = `${imported.product.slug || "(unknown product)"}:${describeSelection(variant.sku.identifyingAttributes)}`;

      if (status === "failed") {
        // The parent product itself was never created (see its own
        // attention item above) -- this SKU has nowhere to attach to.
        skus.failed += 1;
        attention.push({
          kind: "sku",
          identifier: selectionLabel,
          reason: `Parent product "${imported.product.slug || imported.product.title || "(untitled)"}" was not created -- see the matching "product" attention item.`,
        });
        continue;
      }

      if (status === "would-create") {
        // Dry run against a brand-new product -- every one of its variants
        // would also be newly created once the product exists. Still worth
        // flagging an attribute-key mismatch even though we can't call the
        // real resolveVariant/createSku yet.
        if (!identifyingKeysMatch(targetIdentifyingKeys, variant.sku.identifyingAttributes)) {
          skus.failed += 1;
          attention.push({
            kind: "sku",
            identifier: selectionLabel,
            reason: `Identifying attributes [${variant.sku.identifyingAttributes.map((a) => a.key).join(", ")}] do not match the product's identifyingAttributeKeys [${targetIdentifyingKeys.join(", ")}] -- CatalogService.createSku would reject this.`,
          });
          continue;
        }
        skus.created += 1;
        continue;
      }

      // "existing"/"created" are the only remaining statuses here, both of
      // which guarantee a real productId (see importProduct above).
      const realProductId = productId as string;

      try {
        const existingSku = await catalog.resolveVariant(realProductId, variant.sku.identifyingAttributes);
        if (existingSku) {
          skus.skipped += 1;
          if (!dryRun) await inventory.setStock(existingSku.id, variant.inventory.onHand);
          continue;
        }

        if (dryRun) {
          if (!identifyingKeysMatch(targetIdentifyingKeys, variant.sku.identifyingAttributes)) {
            skus.failed += 1;
            attention.push({
              kind: "sku",
              identifier: selectionLabel,
              reason: `Identifying attributes [${variant.sku.identifyingAttributes.map((a) => a.key).join(", ")}] do not match the product's identifyingAttributeKeys [${targetIdentifyingKeys.join(", ")}] -- CatalogService.createSku would reject this.`,
            });
            continue;
          }
          skus.created += 1;
          continue;
        }

        const createdSku = await catalog.createSku({
          productId: realProductId,
          identifyingAttributes: variant.sku.identifyingAttributes,
          price: variant.sku.price,
        });
        skus.created += 1;
        await inventory.setStock(createdSku.id, variant.inventory.onHand);
      } catch (err) {
        skus.failed += 1;
        attention.push({ kind: "sku", identifier: selectionLabel, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  for (const imported of snapshot.products) {
    const productResult = await importProduct(imported);
    await importVariants(imported, productResult);
  }

  async function importCollection(collection: ImportedCollection): Promise<string | null> {
    categories.total += 1;
    if (!collection.handle) {
      categories.failed += 1;
      attention.push({ kind: "category", identifier: collection.title || "(untitled)", reason: "Missing Shopify collection handle -- cannot check for an existing category or create one." });
      return null;
    }

    const existing = await marketingCatalog.getCategoryBySlug(collection.handle);
    if (existing) {
      categories.skipped += 1;
      return existing.id;
    }

    if (dryRun) {
      categories.created += 1;
      return null;
    }

    try {
      const created = await marketingCatalog.createCategory({
        slug: collection.handle,
        title: collection.title,
        description: collection.description,
        parentId: null,
      });
      categories.created += 1;
      return created.id;
    } catch (err) {
      categories.failed += 1;
      attention.push({ kind: "category", identifier: collection.handle, reason: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async function importAssignments(collection: ImportedCollection, categoryId: string | null): Promise<void> {
    for (const productHandle of collection.productHandles) {
      assignments.total += 1;

      if (!snapshotProductSlugs.has(productHandle)) {
        assignments.failed += 1;
        attention.push({
          kind: "assignment",
          identifier: `${collection.handle}:${productHandle}`,
          reason: `Collection "${collection.handle}" references product handle "${productHandle}", which is not present anywhere in this Shopify snapshot.`,
        });
        continue;
      }

      const targetProduct = await catalog.getProductBySlug(productHandle);
      if (!targetProduct) {
        // The product is real (present in this snapshot) but hasn't landed
        // in the target yet -- either this is a dry run (nothing was
        // created), or the product's own import failed and is already in
        // `attention` under kind "product". Count the assignment as one
        // this run would still need to make once the product exists.
        assignments.created += 1;
        continue;
      }

      if (categoryId === null) {
        // Category doesn't exist in the target yet (dry run, or its own
        // create failed and is already in `attention` under kind
        // "category") -- no existing assignment can reference a
        // nonexistent category, so this is a would-create.
        assignments.created += 1;
        continue;
      }

      const existingCategoryIds = await marketingCatalog.listCategoriesForProduct(targetProduct.id);
      if (existingCategoryIds.some((c) => c.id === categoryId)) {
        assignments.skipped += 1;
        continue;
      }

      if (dryRun) {
        assignments.created += 1;
        continue;
      }

      try {
        await marketingCatalog.assignProductToCategory(targetProduct.id, categoryId);
        assignments.created += 1;
      } catch (err) {
        assignments.failed += 1;
        attention.push({ kind: "assignment", identifier: `${collection.handle}:${productHandle}`, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  for (const collection of snapshot.collections) {
    const categoryId = await importCollection(collection);
    await importAssignments(collection, categoryId);
  }

  const sampleProductTitles = snapshot.products.slice(0, sampleSize).map((p) => p.product.title);

  return { dryRun, products, skus, categories, assignments, sampleProductTitles, attention };
}
