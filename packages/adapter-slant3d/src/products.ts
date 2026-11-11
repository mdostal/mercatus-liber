import type { FulfillmentProviderKey, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import type { Slant3dCatalogClient } from "./catalog.js";
import { SLANT3D_PROVIDER } from "./provider.js";
import type { Slant3dFilament } from "./slant3d-types.js";

/**
 * One product a store sells through Slant: one uploaded model, offered in a
 * list of filaments, each at its own retail price. Plain data, so a store keeps
 * its lineup in its database or a file instead of in code.
 */
export interface Slant3dProductSpec {
  slug: string;
  title: string;
  description: string;
  /** The uploaded model's publicFileServiceId. */
  fileId: string;
  /** What to charge for each filament. No default: retail prices are the store's decision. Prices are US cents, the currency Slant charges in. */
  variants: { filamentId: string; retailCents: number }[];
}

export interface PlannedSlant3dSku {
  filamentId: string;
  /** The filament's material, e.g. "PLA". */
  material: string;
  /** The filament's colour, e.g. "matte black". */
  color: string;
  price: { amount: number; currency: "USD" };
  /** What Slant estimates it charges to print one, before shipping. */
  costCents: number;
  /** price - cost. Can be negative, and shipping isn't in it, so check it before publishing. */
  marginCents: number;
}

export interface Slant3dProductPlan {
  spec: Slant3dProductSpec;
  skus: PlannedSlant3dSku[];
  /** Requested filaments Slant doesn't list, or lists as unavailable. */
  unavailable: string[];
}

/** Prices one unit of a file in each filament. One Slant request per filament; the limit is 100 requests a minute. */
export async function estimateSlant3dUnitCosts(client: Pick<Slant3dCatalogClient, "estimate">, fileId: string, filamentIds: string[]): Promise<Record<string, number>> {
  const costs: Record<string, number> = {};
  for (const filamentId of new Set(filamentIds)) costs[filamentId] = (await client.estimate({ fileId, filamentId, quantity: 1 })).totalCents;
  return costs;
}

/**
 * Works out every SKU a spec produces, with its cost and the margin at the
 * spec's price. Pure: pass in the filament list from the catalog client and the
 * unit costs from estimateSlant3dUnitCosts. A filament Slant doesn't list, or
 * lists with `available: false`, goes to `unavailable` instead of becoming a SKU.
 */
export function planSlant3dProduct(spec: Slant3dProductSpec, filaments: Slant3dFilament[], costCentsByFilament: Record<string, number>): Slant3dProductPlan {
  const skus: PlannedSlant3dSku[] = [];
  const unavailable: string[] = [];
  for (const variant of spec.variants) {
    const filament = filaments.find((f) => f.publicId === variant.filamentId);
    if (!filament || filament.available === false) {
      unavailable.push(variant.filamentId);
      continue;
    }
    const costCents = costCentsByFilament[variant.filamentId];
    if (costCents === undefined) throw new Error(`No cost was supplied for filament ${variant.filamentId}`);
    // SKUs are told apart by material and colour, so two filaments sharing both can't be sold side by side.
    const clash = skus.find((s) => s.material === filament.profile && s.color === filament.color);
    if (clash) throw new Error(`Filaments ${clash.filamentId} and ${variant.filamentId} are both ${filament.profile} ${filament.color}; a product can offer only one of them`);
    skus.push({ filamentId: variant.filamentId, material: filament.profile, color: filament.color, price: { amount: variant.retailCents, currency: "USD" }, costCents, marginCents: variant.retailCents - costCents });
  }
  return { spec, skus, unavailable };
}

interface CatalogSku {
  id: string;
  identifyingAttributes: { key: string; value: unknown }[];
  price: { amount: number; currency: string };
}

/**
 * The catalog calls applySlant3dProduct needs, written out structurally because
 * this package doesn't depend on @mercatus-liber/core. It has the same shape as
 * adapter-printful's PrintfulCatalogWriter, which @mercatus-liber/catalog's
 * CatalogService satisfies.
 */
export interface Slant3dCatalogWriter {
  getProductBySlug(slug: string): Promise<{ id: string } | null>;
  createProduct(input: { slug: string; title: string; description: string; identifyingAttributeKeys: string[] }): Promise<{ id: string }>;
  listSkusByProduct(productId: string): Promise<CatalogSku[]>;
  createSku(input: { productId: string; identifyingAttributes: { key: string; value: string }[]; price: { amount: number; currency: string } }): Promise<CatalogSku>;
  updateSku(id: string, patch: { price?: { amount: number; currency: string } }): Promise<unknown>;
}

export interface Slant3dRoutingWriter {
  setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void>;
}

export interface ApplySlant3dProductResult {
  productId: string;
  created: string[];
  updated: string[];
}

const attr = (sku: CatalogSku, key: string): unknown => sku.identifyingAttributes.find((a) => a.key === key)?.value;

/**
 * Makes the catalog match a plan: creates the product and any missing SKUs
 * (identified by material and colour), stores each SKU's file and filament, and
 * routes it to Slant. Safe to run again. An existing SKU keeps its price unless
 * `updatePrices` is set, so re-running can't undo a price changed in the admin.
 */
export async function applySlant3dProduct(
  deps: { catalog: Slant3dCatalogWriter; mappings: ProviderCatalogMappingRepository; routing: Slant3dRoutingWriter },
  plan: Slant3dProductPlan,
  options: { updatePrices?: boolean } = {},
): Promise<ApplySlant3dProductResult> {
  const { spec } = plan;
  const product =
    (await deps.catalog.getProductBySlug(spec.slug)) ??
    (await deps.catalog.createProduct({ slug: spec.slug, title: spec.title, description: spec.description, identifyingAttributeKeys: ["material", "color"] }));
  const existing = await deps.catalog.listSkusByProduct(product.id);
  const result: ApplySlant3dProductResult = { productId: product.id, created: [], updated: [] };

  for (const planned of plan.skus) {
    let sku = existing.find((s) => attr(s, "material") === planned.material && attr(s, "color") === planned.color);
    if (!sku) {
      sku = await deps.catalog.createSku({ productId: product.id, identifyingAttributes: [{ key: "material", value: planned.material }, { key: "color", value: planned.color }], price: planned.price });
      result.created.push(sku.id);
    } else if (options.updatePrices && sku.price.amount !== planned.price.amount) {
      await deps.catalog.updateSku(sku.id, { price: planned.price });
      result.updated.push(sku.id);
    }
    await deps.mappings.save({ skuId: sku.id, provider: SLANT3D_PROVIDER, target: { fileId: spec.fileId, filamentId: planned.filamentId } });
    await deps.routing.setProviderForSku(sku.id, SLANT3D_PROVIDER);
  }
  return result;
}
