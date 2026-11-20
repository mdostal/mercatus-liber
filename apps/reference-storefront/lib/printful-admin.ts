/**
 * The Printful catalog in the demo admin: browse every Printful product, see
 * one in detail, and see which are already in this demo's store.
 *
 * With PRINTFUL_API_TOKEN set it reads Printful live (cached for a day per
 * server instance). Without one it browses lib/data/printful-catalog-snapshot.json,
 * a trimmed copy of the listing saved by scripts/refresh-printful-snapshot.mjs;
 * costs, print areas and stock need the token.
 */
import {
  createPrintfulCatalogCache,
  printfulPriceToCents,
  printfulProductsInStore,
  printfulUnitCostCents,
  type PrintfulCatalogCache,
  type PrintfulCatalogCategory,
  type PrintfulCatalogListing,
  type PrintfulCatalogSnapshot,
  type PrintfulPrintArea,
} from "@mercatus-liber/adapter-printful";
import type { CatalogGridFacet, CatalogGridItem, PrintAreaRow, VariantCell } from "@mercatus-liber/admin-ui";
import snapshotJson from "./data/printful-catalog-snapshot.json";
import { listProductsForDemo, type DemoSlug } from "./demos";
import type { Services } from "./services";

const SNAPSHOT = snapshotJson as PrintfulCatalogSnapshot;

const globalCache = globalThis as unknown as { __printfulCatalogCache?: PrintfulCatalogCache };

/** Live with a token, the saved snapshot without. */
export function printfulCatalogCache(services: Pick<Services, "printfulCatalog">): PrintfulCatalogCache {
  const client = services.printfulCatalog;
  globalCache.__printfulCatalogCache ??= createPrintfulCatalogCache({
    load: async () => SNAPSHOT,
    ...(client
      ? {
          fetch: async () => {
            const [products, categories] = await Promise.all([client.listAllCatalogProducts(), client.listCategories()]);
            return { products, categories };
          },
        }
      : {}),
  });
  return globalCache.__printfulCatalogCache;
}

export const isLivePrintful = (services: Pick<Services, "printfulCatalog">) => services.printfulCatalog !== null;

/** `{ printfulProductId -> store products }` for this demo only. */
export async function printfulInStore(services: Pick<Services, "catalog" | "providerCatalogMappings" | "printfulCatalog">, demoSlug: DemoSlug) {
  const products = await listProductsForDemo(services.catalog, demoSlug);
  const byId = new Map(products.map((p) => [p.id, p]));
  const client = services.printfulCatalog;
  const found = await printfulProductsInStore({
    mappings: services.providerCatalogMappings,
    getSku: (id) => services.catalog.getSku(id),
    productIds: byId.keys(),
    ...(client ? { variantProductId: async (variantId: number) => (await client.getVariant(variantId))?.catalog_product_id ?? null } : {}),
  });
  return new Map([...found].map(([printfulId, ids]) => [printfulId, ids.map((id) => byId.get(id)!).filter(Boolean)]));
}

/** The category ids from the top level down to each category. */
function categoryPath(categories: PrintfulCatalogCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (id: number): number[] => {
    const path: number[] = [];
    for (let c = byId.get(id); c && !path.includes(c.id); c = c.parent_id !== null ? byId.get(c.parent_id) : undefined) path.unshift(c.id);
    return path;
  };
}

export function printfulGridItems(snapshot: PrintfulCatalogSnapshot, inStore: Map<number, { id: string; title: string }[]>, adminBase: string): CatalogGridItem[] {
  const pathOf = categoryPath(snapshot.categories);
  return snapshot.products
    .filter((p) => !p.is_discontinued)
    .map((p) => ({
      id: String(p.id),
      name: p.name,
      subtitle: [p.brand, p.model].filter(Boolean).join(" ") || p.type,
      imageUrl: p.image,
      href: `${adminBase}/printful/${p.id}`,
      tags: { category: pathOf(p.main_category_id).map(String), technique: p.techniques.map((t) => t.key), placement: [...new Set(p.placements.map((pl) => pl.placement))] },
      badges: [`${p.colors.length || "1"} colour${p.colors.length === 1 ? "" : "s"}`, `${p.sizes.length} size${p.sizes.length === 1 ? "" : "s"}`],
      ...(inStore.get(p.id)?.length ? { inStore: inStore.get(p.id)!.map((sp) => ({ label: sp.title, href: `${adminBase}/products/${sp.id}/skus` })) } : {}),
    }));
}

/** Category (top level, then one level down, indented), technique and placement filters. */
export function printfulFacets(snapshot: PrintfulCatalogSnapshot): CatalogGridFacet[] {
  const top = snapshot.categories.filter((c) => c.parent_id === null);
  const categoryOptions = top.flatMap((c) => [
    { value: String(c.id), label: c.title },
    ...snapshot.categories.filter((child) => child.parent_id === c.id).map((child) => ({ value: String(child.id), label: `  ${child.title}` })),
  ]);
  const techniques = new Map<string, string>();
  const placements = new Set<string>();
  for (const p of snapshot.products) {
    for (const t of p.techniques) techniques.set(t.key, t.display_name);
    for (const pl of p.placements) placements.add(pl.placement);
  }
  return [
    { key: "category", label: "Category", options: categoryOptions },
    { key: "technique", label: "Technique", options: [...techniques].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)) },
    { key: "placement", label: "Placement", options: [...placements].sort().map((value) => ({ value, label: placementLabel(value) })) },
  ];
}

/** "sleeve_left" -> "Sleeve left". */
export function placementLabel(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const dollars = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export interface PrintfulProductDetail {
  listing: PrintfulCatalogListing;
  cells: Record<string, VariantCell>;
  printAreas: PrintAreaRow[];
  /** Raw print areas, for placing art. */
  areas: PrintfulPrintArea[];
  variants: { id: number; color: string; size: string; colorCode: string | null }[];
  live: boolean;
}

/**
 * One Printful product. Live: every variant with its cost for the default
 * technique (one placement included) and its US stock, and every print area
 * with its size and price. From the snapshot: the listing only.
 */
export async function printfulProductDetail(services: Pick<Services, "printfulCatalog">, productId: number): Promise<PrintfulProductDetail | null> {
  const client = services.printfulCatalog;
  const snapshot = await printfulCatalogCache(services).get();
  const fromList = snapshot.products.find((p) => p.id === productId) ?? null;
  if (!client) {
    if (!fromList) return null;
    const cells = Object.fromEntries(fromList.colors.flatMap((c) => fromList.sizes.map((s) => [`${c.name}|${s}`, {}])));
    return { listing: fromList, cells, printAreas: fromList.placements.map((p) => ({ label: placementLabel(p.placement), technique: p.technique })), areas: [], variants: [], live: false };
  }
  const listing = (await client.getCatalogListing(productId)) ?? fromList;
  if (!listing) return null;
  const [variants, prices, areas, availability] = await Promise.all([client.listVariants(productId), client.getPrices(productId), client.getPrintAreas(productId), client.getAvailability(productId)]);
  const technique = listing.techniques.find((t) => t.is_default)?.key ?? listing.techniques[0]?.key ?? "";
  const stock = new Map(availability.map((a) => [a.catalogVariantId, a.techniques.find((t) => t.technique === technique)?.regions ?? []]));
  const cells: Record<string, VariantCell> = {};
  for (const v of variants) {
    const regions = stock.get(v.id) ?? [];
    const firstPlacement = prices?.product.placements.find((p) => p.technique_key === technique)?.id;
    let cost: string | undefined;
    try {
      if (prices && firstPlacement) cost = dollars(printfulUnitCostCents(prices, v.id, technique, [firstPlacement]), prices.currency);
    } catch {
      cost = undefined;
    }
    cells[`${v.color}|${v.size}`] = {
      ...(cost ? { cost } : {}),
      available: regions.length === 0 ? true : regions.some((r) => r.availability === "in stock"),
      note: regions.map((r) => `${r.name}: ${r.availability}`).join(", "),
    };
  }
  const priceOf = (placement: string, tech: string) => {
    const p = prices?.product.placements.find((x) => x.id === placement && x.technique_key === tech);
    return p ? `+${dollars(printfulPriceToCents(p.discounted_price || p.price), prices!.currency)}` : undefined;
  };
  const printAreas = areas.map((a) => ({
    label: a.displayName || placementLabel(a.placement),
    technique: listing.techniques.find((t) => t.key === a.technique)?.display_name ?? a.technique,
    size: `${a.widthInches} × ${a.heightInches} in, ${a.widthPx} × ${a.heightPx} px at ${a.dpi} dpi`,
    ...(priceOf(a.placement, a.technique) ? { price: priceOf(a.placement, a.technique)! } : {}),
  }));
  return {
    listing,
    cells,
    printAreas,
    areas,
    variants: variants.map((v) => ({ id: v.id, color: v.color, size: v.size, colorCode: v.color_code })),
    live: true,
  };
}

/** e.g. "Read from Printful 20 Nov 2026" or "Saved copy from 20 Nov 2026". */
export function snapshotCaption(snapshot: PrintfulCatalogSnapshot, live: boolean): string {
  const date = new Date(snapshot.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return live ? `Printful's catalog, read ${date}. Refreshed daily.` : `A saved copy of Printful's catalog from ${date}. Set PRINTFUL_API_TOKEN for live costs, stock and print areas.`;
}
