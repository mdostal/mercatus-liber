import type { FulfillmentProviderKey, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import type { DapiOrderLineMaterials, DapiQuote } from "./dapi-types.js";
import { parseDapiCatalogTarget, type DapiCatalogTarget } from "./mapping.js";
import { DAPI_PROVIDER } from "./provider.js";

/**
 * One product a store sells through 3DAPI, as plain data: each variant is a
 * quoted model file, the materials to print it in, and a retail price.
 *
 * Unlike a Printful product there is no blank with a grid of colors and sizes:
 * a 3D-printed variant is whatever file and materials you say it is, so every
 * variant is listed out.
 */
export interface DapiProductSpec {
  slug: string;
  title: string;
  description: string;
  variants: DapiVariantSpec[];
  /** The currency SKUs are priced in. Defaults to the quotes' currency, uppercased ("USD"). */
  currency?: string;
}

export interface DapiVariantSpec {
  /** What tells this variant apart, e.g. `{ color: "Black", size: "Large" }`. Every variant needs the same keys. */
  attributes: Record<string, string>;
  quoteId: string;
  /** Set this or `useSuggestedMaterials`. */
  materials?: DapiOrderLineMaterials;
  useSuggestedMaterials?: true;
  extras?: { extra: string; quantityPerUnit: number }[];
  /** What to charge. No default: retail prices are the store's decision. */
  retailCents: number;
}

/** A minor-unit amount with an ISO 4217 code. Same shape as @mercatus-liber/core's Money. */
export interface DapiSkuPrice {
  amount: number;
  currency: string;
}

export interface PlannedDapiSku {
  attributes: Record<string, string>;
  target: DapiCatalogTarget;
  price: DapiSkuPrice;
  /** What 3DAPI charges to print one unit, before shipping and before any extras. */
  costCents: number;
  /** price - cost. Can be negative, so check it before publishing. */
  marginCents: number;
}

export interface DapiProductPlan {
  spec: DapiProductSpec;
  skus: PlannedDapiSku[];
  /** Variants left out, with the reason: the quote is missing, not ready, or the materials are not usable. */
  skipped: { attributes: Record<string, string>; quoteId: string; reason: string }[];
}

/**
 * Works out every SKU a spec produces, with its cost and the margin at the
 * spec's price. Pure: pass in the quotes, read with the catalog client.
 *
 * The cost is the quote's `price`, which 3DAPI defines as the production price
 * of one unit. It leaves out shipping and extras, and 3DAPI charges less per
 * unit at larger quantities. Pass `costCentsByQuote` to use other figures.
 */
export function planDapiProduct(spec: DapiProductSpec, quotes: DapiQuote[], costCentsByQuote: Record<string, number> = {}): DapiProductPlan {
  const skus: PlannedDapiSku[] = [];
  const skipped: DapiProductPlan["skipped"] = [];
  for (const variant of spec.variants) {
    const skip = (reason: string): void => void skipped.push({ attributes: variant.attributes, quoteId: variant.quoteId, reason });
    const quote = quotes.find((q) => q.id === variant.quoteId);
    if (!quote) {
      skip("no such quote was passed in");
      continue;
    }
    if (quote.status !== "ready" || !quote.price) {
      skip(quote.status === "failed" ? `the quote failed: ${quote.failure_reason ?? "no reason given"}` : `the quote is ${quote.status}`);
      continue;
    }
    if (variant.useSuggestedMaterials && !quote.suggested_materials) {
      skip("the quote has no suggested materials, so list materials instead");
      continue;
    }
    const parsed = parseDapiCatalogTarget({
      quoteId: variant.quoteId,
      ...(variant.materials !== undefined ? { materials: variant.materials } : {}),
      ...(variant.useSuggestedMaterials !== undefined ? { useSuggestedMaterials: variant.useSuggestedMaterials } : {}),
      ...(variant.extras !== undefined ? { extras: variant.extras } : {}),
    });
    if (!parsed.ok) {
      skip(parsed.reason);
      continue;
    }
    const costCents = costCentsByQuote[quote.id] ?? quote.price.amount;
    const currency = spec.currency ?? quote.price.currency.toUpperCase();
    skus.push({ attributes: variant.attributes, target: parsed.target, price: { amount: variant.retailCents, currency }, costCents, marginCents: variant.retailCents - costCents });
  }
  return { spec, skus, skipped };
}

interface CatalogSku {
  id: string;
  identifyingAttributes: { key: string; value: unknown }[];
  price: DapiSkuPrice;
}

/**
 * The catalog calls applyDapiProduct needs. Written to match
 * @mercatus-liber/catalog's CatalogService, the way adapter-printful's
 * PrintfulCatalogWriter does. This package does not depend on
 * @mercatus-liber/core or catalog, so that match is not checked by the compiler here.
 */
export interface DapiCatalogWriter {
  getProductBySlug(slug: string): Promise<{ id: string } | null>;
  createProduct(input: { slug: string; title: string; description: string; identifyingAttributeKeys: string[] }): Promise<{ id: string }>;
  listSkusByProduct(productId: string): Promise<CatalogSku[]>;
  createSku(input: { productId: string; identifyingAttributes: { key: string; value: string }[]; price: DapiSkuPrice }): Promise<CatalogSku>;
  updateSku(id: string, patch: { price?: DapiSkuPrice }): Promise<unknown>;
}

export interface DapiRoutingWriter {
  setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void>;
}

export interface ApplyDapiProductResult {
  productId: string;
  created: string[];
  updated: string[];
}

/**
 * Makes the catalog match a plan: creates the product and any missing SKUs,
 * stores each SKU's quote and materials, and routes it to 3DAPI. Safe to run
 * again. An existing SKU keeps its price unless `updatePrices` is set.
 */
export async function applyDapiProduct(
  deps: { catalog: DapiCatalogWriter; mappings: ProviderCatalogMappingRepository; routing: DapiRoutingWriter },
  plan: DapiProductPlan,
  options: { updatePrices?: boolean } = {},
): Promise<ApplyDapiProductResult> {
  const { spec } = plan;
  const keys = [...new Set(spec.variants.flatMap((v) => Object.keys(v.attributes)))];
  const product = (await deps.catalog.getProductBySlug(spec.slug)) ?? (await deps.catalog.createProduct({ slug: spec.slug, title: spec.title, description: spec.description, identifyingAttributeKeys: keys }));
  const existing = await deps.catalog.listSkusByProduct(product.id);
  const result: ApplyDapiProductResult = { productId: product.id, created: [], updated: [] };

  for (const planned of plan.skus) {
    const attributes = Object.entries(planned.attributes).map(([key, value]) => ({ key, value }));
    let sku = existing.find((s) => attributes.every((a) => s.identifyingAttributes.find((e) => e.key === a.key)?.value === a.value));
    if (!sku) {
      sku = await deps.catalog.createSku({ productId: product.id, identifyingAttributes: attributes, price: planned.price });
      result.created.push(sku.id);
    } else if (options.updatePrices && sku.price.amount !== planned.price.amount) {
      await deps.catalog.updateSku(sku.id, { price: planned.price });
      result.updated.push(sku.id);
    }
    await deps.mappings.save({ skuId: sku.id, provider: DAPI_PROVIDER, target: { ...planned.target } });
    await deps.routing.setProviderForSku(sku.id, DAPI_PROVIDER);
  }
  return result;
}
