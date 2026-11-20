import type { IdentifyingAttribute, Money, Product, Sku } from "@mercatus-liber/core";
import type { FulfillmentProviderKey, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { printfulUnitCostCents, type PrintfulCatalogVariant, type PrintfulPrices } from "./catalog.js";
import type { PrintfulCatalogTarget } from "./mapping.js";
import { PRINTFUL_PROVIDER } from "./provider.js";

/**
 * One product a store sells through Printful: which Printful blank, which
 * colors and sizes, which print files go where, and what to charge. Plain data,
 * so a store keeps its lineup in its database or a file instead of in code.
 */
export interface PrintfulProductSpec {
  slug: string;
  title: string;
  description: string;
  /** Printful's catalog product id, e.g. 12 for the Gildan 64000 tee. */
  printfulProductId: number;
  /** Printful's technique key: "dtg", "dtfilm", "embroidery", and so on. */
  technique: string;
  /**
   * One print file per placement, e.g. `{ placement: "front", url }`. Each URL
   * must be public. May be empty to bring a product over before its art
   * exists: its SKUs are then created as drafts, which can't be bought, and
   * art is added later with setPrintfulArt.
   */
  files: { placement: string; url: string }[];
  /** Printful color names, exactly as Printful lists them, e.g. "Black". */
  colors: string[];
  /** Sizes to sell, in Printful's names. Omit for every size Printful offers in these colors. */
  sizes?: string[];
  /** What to charge. No default: retail prices are the store's decision. */
  pricing: { retailCents: number; sizeUpchargeCents?: Record<string, number> };
  currency?: string;
}

export interface PlannedPrintfulSku {
  color: string;
  size: string;
  catalogVariantId: number;
  price: Money;
  /** What Printful charges per unit, before shipping. */
  costCents: number;
  /** price - cost. Can be negative, so check it before publishing. */
  marginCents: number;
}

export interface PrintfulProductPlan {
  spec: PrintfulProductSpec;
  skus: PlannedPrintfulSku[];
  /** Requested color and size pairs Printful doesn't make. */
  unavailable: { color: string; size: string }[];
}

/**
 * Works out every SKU a spec produces, with its cost and the margin at the
 * spec's price. Pure: pass in the product's variants and prices from the catalog
 * client. Costs come from Printful's price list, which can be higher than what
 * Printful actually charges; pass `costCentsByVariant` (e.g. from
 * estimateCosts) to use exact costs instead.
 */
export function planPrintfulProduct(spec: PrintfulProductSpec, variants: PrintfulCatalogVariant[], prices: PrintfulPrices, costCentsByVariant: Record<number, number> = {}): PrintfulProductPlan {
  const currency = spec.currency ?? prices.currency;
  const placements = spec.files.map((f) => f.placement);
  const sizes = spec.sizes ?? [...new Set(variants.filter((v) => spec.colors.includes(v.color)).map((v) => v.size))];
  const skus: PlannedPrintfulSku[] = [];
  const unavailable: { color: string; size: string }[] = [];
  for (const color of spec.colors) {
    for (const size of sizes) {
      const variant = variants.find((v) => v.color === color && v.size === size);
      if (!variant) {
        unavailable.push({ color, size });
        continue;
      }
      const costCents = costCentsByVariant[variant.id] ?? printfulUnitCostCents(prices, variant.id, spec.technique, placements);
      const amount = spec.pricing.retailCents + (spec.pricing.sizeUpchargeCents?.[size] ?? 0);
      skus.push({ color, size, catalogVariantId: variant.id, price: { amount, currency }, costCents, marginCents: amount - costCents });
    }
  }
  return { spec, skus, unavailable };
}

/** The catalog calls applyPrintfulProduct needs. @mercatus-liber/catalog's CatalogService satisfies it. */
export interface PrintfulCatalogWriter {
  getProductBySlug(slug: string): Promise<Product | null>;
  createProduct(input: { slug: string; title: string; description: string; identifyingAttributeKeys: string[] }): Promise<Product>;
  listSkusByProduct(productId: string): Promise<Sku[]>;
  createSku(input: { productId: string; identifyingAttributes: IdentifyingAttribute[]; price: Money; status?: "draft" | "active" }): Promise<Sku>;
  updateSku(id: string, patch: { price?: Money; status?: "draft" | "active" }): Promise<Sku | null>;
}

export interface PrintfulRoutingWriter {
  setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void>;
}

export interface ApplyPrintfulProductResult {
  productId: string;
  created: string[];
  updated: string[];
}

const attr = (sku: Sku, key: string): unknown => sku.identifyingAttributes.find((a) => a.key === key)?.value;

type Placement = NonNullable<PrintfulCatalogTarget["placements"]>[number];

/**
 * The SKU's placements after applying new files: a placement named in `files`
 * gets that file, every other placement it already had keeps its file. So
 * re-running a plan, or one with no files, never loses art added later.
 */
export function mergePrintfulPlacements(existing: Placement[] | undefined, files: { placement: string; url: string }[], technique: string): Placement[] {
  const merged = new Map((existing ?? []).map((p) => [p.placement, p]));
  for (const f of files) merged.set(f.placement, { placement: f.placement, technique, layers: [{ type: "file", url: f.url }] });
  return [...merged.values()];
}

/**
 * Makes the catalog match a plan: creates the product and any missing SKUs,
 * stores each SKU's Printful variant and print files, and routes it to Printful.
 * Safe to run again. An existing SKU keeps its price unless `updatePrices` is
 * set, so re-running can't undo a price changed in the admin. Print files are
 * merged into what each SKU already has (see mergePrintfulPlacements).
 *
 * A new SKU that ends up with no print file is created as a draft, so it
 * can't be sold before it can be made; otherwise new SKUs get `newSkuStatus`
 * (default "active", as before). publishPrintfulProduct makes drafts active
 * once the product is ready.
 */
export async function applyPrintfulProduct(
  deps: { catalog: PrintfulCatalogWriter; mappings: ProviderCatalogMappingRepository; routing: PrintfulRoutingWriter },
  plan: PrintfulProductPlan,
  options: { updatePrices?: boolean; newSkuStatus?: "draft" | "active" } = {},
): Promise<ApplyPrintfulProductResult> {
  const { spec } = plan;
  const product =
    (await deps.catalog.getProductBySlug(spec.slug)) ??
    (await deps.catalog.createProduct({ slug: spec.slug, title: spec.title, description: spec.description, identifyingAttributeKeys: ["color", "size"] }));
  const existing = await deps.catalog.listSkusByProduct(product.id);
  const result: ApplyPrintfulProductResult = { productId: product.id, created: [], updated: [] };

  for (const planned of plan.skus) {
    let sku = existing.find((s) => attr(s, "color") === planned.color && attr(s, "size") === planned.size);
    const previous = sku ? ((await deps.mappings.get(sku.id, PRINTFUL_PROVIDER))?.target as PrintfulCatalogTarget | undefined) : undefined;
    const placements = mergePrintfulPlacements(previous?.placements, spec.files, spec.technique);
    if (!sku) {
      const status = placements.length === 0 ? "draft" : (options.newSkuStatus ?? "active");
      sku = await deps.catalog.createSku({ productId: product.id, identifyingAttributes: [{ key: "color", value: planned.color }, { key: "size", value: planned.size }], price: planned.price, status });
      result.created.push(sku.id);
    } else if (options.updatePrices && sku.price.amount !== planned.price.amount) {
      await deps.catalog.updateSku(sku.id, { price: planned.price });
      result.updated.push(sku.id);
    }
    await deps.mappings.save({
      skuId: sku.id,
      provider: PRINTFUL_PROVIDER,
      target: {
        catalogVariantId: planned.catalogVariantId,
        catalogProductId: spec.printfulProductId,
        placements,
      },
    });
    await deps.routing.setProviderForSku(sku.id, PRINTFUL_PROVIDER);
  }
  return result;
}
