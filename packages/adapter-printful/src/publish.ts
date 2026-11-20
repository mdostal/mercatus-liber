import type { Product, Sku } from "@mercatus-liber/core";
import type { ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { printfulUnitCostCents, type PrintfulPrices } from "./catalog.js";
import { mergePrintfulPlacements } from "./products.js";
import { printfulTargetHasArt, type PrintfulCatalogTarget } from "./mapping.js";
import { PRINTFUL_PROVIDER } from "./provider.js";

export type PrintfulReadinessCode = "no-skus" | "not-printful" | "no-art" | "below-cost" | "no-image";

export interface PrintfulReadinessProblem {
  code: PrintfulReadinessCode;
  message: string;
  skuIds?: string[];
}

export interface PrintfulReadiness {
  ready: boolean;
  problems: PrintfulReadinessProblem[];
  /** Per SKU: its price, what Printful charges for it with its current print files (when prices were given), and whether it has art. */
  skus: { skuId: string; label: string; priceCents: number; costCents: number | null; hasArt: boolean; status: Sku["status"] }[];
}

export interface PrintfulReadinessDeps {
  catalog: { getProduct(id: string): Promise<Product | null>; listSkusByProduct(productId: string): Promise<Sku[]> };
  mappings: ProviderCatalogMappingRepository;
  /** Printful's prices for a catalog product (the catalog client's getPrices). Without it, costs aren't checked. */
  prices?: (printfulProductId: number) => Promise<PrintfulPrices | null>;
}

const label = (sku: Sku) => sku.identifyingAttributes.map((a) => String(a.value)).join(" / ") || sku.id;

/**
 * Whether a store product made from Printful can go on sale: every SKU is
 * mapped to Printful with a print file for each placement, sells for more
 * than Printful charges with those placements (each extra placement adds to
 * the cost, so this is checked again here rather than trusted from when the
 * product was brought over), and the product has at least one image.
 */
export async function printfulReadiness(deps: PrintfulReadinessDeps, productId: string): Promise<PrintfulReadiness> {
  const product = await deps.catalog.getProduct(productId);
  if (!product) throw new Error(`No product "${productId}".`);
  const skus = await deps.catalog.listSkusByProduct(productId);
  const problems: PrintfulReadinessProblem[] = [];
  const rows: PrintfulReadiness["skus"] = [];
  const pricesById = new Map<number, PrintfulPrices | null>();
  const notMapped: string[] = [];
  const noArt: string[] = [];
  const belowCost: string[] = [];

  for (const sku of skus) {
    const target = (await deps.mappings.get(sku.id, PRINTFUL_PROVIDER))?.target as PrintfulCatalogTarget | undefined;
    if (!target) {
      notMapped.push(sku.id);
      continue;
    }
    const hasArt = printfulTargetHasArt(target);
    if (!hasArt) noArt.push(sku.id);
    let costCents: number | null = null;
    if (deps.prices && target.catalogProductId !== undefined && hasArt) {
      if (!pricesById.has(target.catalogProductId)) pricesById.set(target.catalogProductId, await deps.prices(target.catalogProductId));
      const prices = pricesById.get(target.catalogProductId);
      const placements = target.placements ?? [];
      if (prices && placements.length) {
        try {
          costCents = printfulUnitCostCents(prices, target.catalogVariantId, placements[0]!.technique, placements.map((p) => p.placement));
        } catch {
          costCents = null;
        }
      }
      if (costCents !== null && sku.price.amount <= costCents) belowCost.push(sku.id);
    }
    rows.push({ skuId: sku.id, label: label(sku), priceCents: sku.price.amount, costCents, hasArt, status: sku.status });
  }

  if (skus.length === 0) problems.push({ code: "no-skus", message: "The product has no SKUs." });
  if (notMapped.length) problems.push({ code: "not-printful", message: `${notMapped.length} SKU(s) aren't made by Printful.`, skuIds: notMapped });
  if (noArt.length) problems.push({ code: "no-art", message: `${noArt.length} SKU(s) have no print file yet.`, skuIds: noArt });
  if (belowCost.length) problems.push({ code: "below-cost", message: `${belowCost.length} SKU(s) sell for no more than Printful charges with their print files.`, skuIds: belowCost });
  if (!product.images?.length) problems.push({ code: "no-image", message: "The product has no image. Add a mockup or photo first." });
  return { ready: problems.length === 0, problems, skus: rows };
}

/** Thrown by publishPrintfulProduct when the product isn't ready to sell. */
export class PrintfulProductNotReadyError extends Error {
  constructor(readonly problems: PrintfulReadinessProblem[]) {
    super(`This product isn't ready to sell: ${problems.map((p) => p.message).join(" ")}`);
    this.name = "PrintfulProductNotReadyError";
  }
}

/**
 * Puts a Printful product on sale: checks printfulReadiness, then makes every
 * draft SKU active and publishes the product. Throws
 * PrintfulProductNotReadyError, changing nothing, when it isn't ready.
 */
export async function publishPrintfulProduct(
  deps: PrintfulReadinessDeps & {
    catalog: PrintfulReadinessDeps["catalog"] & { updateSku(id: string, patch: { status?: "draft" | "active" }): Promise<Sku | null>; publishProduct(id: string): Promise<Product> };
  },
  productId: string,
): Promise<PrintfulReadiness> {
  const readiness = await printfulReadiness(deps, productId);
  if (!readiness.ready) throw new PrintfulProductNotReadyError(readiness.problems);
  for (const sku of readiness.skus) if (sku.status !== "active") await deps.catalog.updateSku(sku.skuId, { status: "active" });
  await deps.catalog.publishProduct(productId);
  return readiness;
}

/**
 * Sets or replaces print files on every SKU of a Printful product, keeping
 * placements not named. `remove` drops placements. A SKU that loses its last
 * file goes back to draft so it can't be sold.
 */
export async function setPrintfulArt(
  deps: { catalog: { listSkusByProduct(productId: string): Promise<Sku[]>; updateSku(id: string, patch: { status?: "draft" | "active" }): Promise<Sku | null> }; mappings: ProviderCatalogMappingRepository },
  productId: string,
  files: { placement: string; technique: string; url: string }[],
  options: { remove?: string[] } = {},
): Promise<{ updated: string[] }> {
  const updated: string[] = [];
  for (const sku of await deps.catalog.listSkusByProduct(productId)) {
    const mapping = await deps.mappings.get(sku.id, PRINTFUL_PROVIDER);
    if (!mapping) continue;
    const target = mapping.target as unknown as PrintfulCatalogTarget;
    let placements = target.placements ?? [];
    for (const f of files) placements = mergePrintfulPlacements(placements, [{ placement: f.placement, url: f.url }], f.technique);
    if (options.remove?.length) placements = placements.filter((p) => !options.remove!.includes(p.placement));
    await deps.mappings.save({ ...mapping, target: { ...target, placements } });
    if (placements.length === 0 && sku.status === "active") await deps.catalog.updateSku(sku.id, { status: "draft" });
    updated.push(sku.id);
  }
  return { updated };
}

/** One generated mockup image. Printful's URL is temporary, so copy it before keeping it. */
export interface PrintfulMockupImage {
  catalogVariantId: number;
  placement: string;
  styleId: number | null;
  view: string | null;
  url: string;
}

/** Every image in finished mockup tasks. */
export function printfulMockupImages(tasks: { catalog_variant_mockups?: { catalog_variant_id: number; mockups: { placement: string; mockup_url: string; style_id?: number; view?: string }[] }[] }[]): PrintfulMockupImage[] {
  return tasks.flatMap((task) =>
    (task.catalog_variant_mockups ?? []).flatMap((v) => v.mockups.map((m) => ({ catalogVariantId: v.catalog_variant_id, placement: m.placement, styleId: m.style_id ?? null, view: m.view ?? null, url: m.mockup_url }))),
  );
}

/**
 * What to ask Printful to mock up for a store product: its Printful product,
 * the variants of the chosen SKUs, and the print files they carry (taken from
 * the first chosen SKU; every SKU of a product shares its art). Throws when
 * the SKUs have no art yet.
 */
export async function printfulMockupRequest(
  deps: { mappings: ProviderCatalogMappingRepository },
  skuIds: string[],
): Promise<{ productId: number; variantIds: number[]; files: { placement: string; technique: string; url: string }[] }> {
  const targets: PrintfulCatalogTarget[] = [];
  for (const skuId of skuIds) {
    const target = (await deps.mappings.get(skuId, PRINTFUL_PROVIDER))?.target as PrintfulCatalogTarget | undefined;
    if (target) targets.push(target);
  }
  const first = targets.find((t) => printfulTargetHasArt(t));
  if (!first || first.catalogProductId === undefined) throw new Error("These SKUs have no print file yet (or were mapped before the Printful product was recorded). Add art first.");
  return {
    productId: first.catalogProductId,
    variantIds: [...new Set(targets.filter((t) => t.catalogProductId === first.catalogProductId).map((t) => t.catalogVariantId))],
    files: (first.placements ?? []).map((p) => ({ placement: p.placement, technique: p.technique, url: p.layers[0]!.url! })),
  };
}
