import { lifecycle, type Product, type Sku } from "@mercatus-liber/core";
import type { ApiLine, ApiProduct, ApiSaleWindow, ApiVariant, StoreApiDeps, StoreApiLine, StoreApiPromotion } from "./types.js";

/** An entity's sale window as the API reports it. */
export function saleWindowOf(entity: { status?: string; activeFrom?: string | null; activeTo?: string | null }, now: Date): ApiSaleWindow {
  const l = lifecycle({ ...(entity.status !== undefined ? { status: entity.status } : {}), activeFrom: entity.activeFrom ?? null, activeTo: entity.activeTo ?? null }, now);
  return { activeFrom: l.startsAt, activeTo: l.endsAt, state: l.state, nextChangeAt: l.nextChangeAt };
}

/** A line for the API: its schedule state, hero, sections, and its landing page URL (`${store.url}/lines/${slug}`). */
export function toApiLine(deps: StoreApiDeps, line: StoreApiLine, now: Date): ApiLine {
  return {
    id: line.id,
    slug: line.slug,
    name: line.name,
    description: line.description,
    url: `${deps.store.url}/lines/${line.slug}`,
    hero: line.hero ?? null,
    saleWindow: saleWindowOf({ status: line.status ?? "active", activeFrom: line.activeFrom ?? null, activeTo: line.activeTo ?? null }, now),
    sections: line.sections ?? [],
  };
}

/** Whether a promotion applies right now, by status and schedule. */
export function isPromotionLive(promotion: StoreApiPromotion, now: Date): boolean {
  if (promotion.status !== "active") return false;
  if (promotion.startsAt && new Date(promotion.startsAt) > now) return false;
  if (promotion.endsAt && new Date(promotion.endsAt) <= now) return false;
  if (promotion.usageLimit !== null && promotion.redemptionCount >= promotion.usageLimit) return false;
  return true;
}

/**
 * The best price a shopper gets on a SKU without entering a code: the lowest
 * result of the live, automatic (codeless) product promotions targeting it.
 * Coded promotions are excluded, since the shopper doesn't get them by default.
 */
function salePriceFor(sku: Sku, promotions: StoreApiPromotion[], now: Date): { amount: number; id: string } | null {
  let best: { amount: number; id: string } | null = null;
  for (const promotion of promotions) {
    if (promotion.code !== null || promotion.scope !== "product" || !promotion.targetSkuIds.includes(sku.id) || !isPromotionLive(promotion, now)) continue;
    if (promotion.kind === "fixed" && promotion.currency !== sku.price.currency) continue;
    const off = promotion.kind === "percentage" ? Math.round((sku.price.amount * promotion.value) / 100) : promotion.value;
    const amount = Math.max(0, sku.price.amount - off);
    if (amount < sku.price.amount && (!best || amount < best.amount)) best = { amount, id: promotion.id };
  }
  return best;
}

export async function toApiProduct(deps: StoreApiDeps, product: Product, promotions: StoreApiPromotion[]): Promise<ApiProduct> {
  const now = deps.now?.() ?? new Date();
  const imageUrl = deps.store.imageUrl ?? ((image: { url: string }) => image.url);
  const skus = await deps.catalog.listSkusByProduct(product.id);
  const categories = deps.categories ? await deps.categories.listCategoriesForProduct(product.id) : [];
  const variants: ApiVariant[] = skus.map((sku) => {
    const sale = salePriceFor(sku, promotions, now);
    return {
      id: sku.id,
      options: Object.fromEntries(sku.identifyingAttributes.map((a) => [a.key, a.value])),
      price: sku.price,
      ...(sale ? { salePrice: { amount: sale.amount, currency: sku.price.currency }, salePromotionId: sale.id } : {}),
      status: sku.status,
      availability: sku.availabilityStatus ?? "active",
      images: (sku.images ?? []).map((i, index) => ({ url: imageUrl({ url: i.url, productId: product.id, skuId: sku.id, index }), alt: i.alt })),
    };
  });
  const amounts = variants.filter((v) => v.status === "active").map((v) => v.salePrice?.amount ?? v.price.amount);
  const currency = variants[0]?.price.currency ?? deps.store.currency;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    status: product.status,
    url: deps.store.productUrl ? deps.store.productUrl(product) : `${deps.store.url}/products/${product.slug}`,
    images: (product.images ?? []).map((i, index) => ({ url: imageUrl({ url: i.url, productId: product.id, skuId: null, index }), alt: i.alt })),
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, title: c.title })),
    variants,
    priceRange: amounts.length > 0 ? { min: { amount: Math.min(...amounts), currency }, max: { amount: Math.max(...amounts), currency } } : null,
    saleWindow: saleWindowOf(product, now),
  };
}
