import type { Money } from "@mercatus-liber/core";
import type {
  BiEventLogRepository,
  BiMetricsAdapter,
  CollectionMetricsSource,
  CollectionSales,
  OrderMetricsSource,
  PromotionMetricsSource,
  SkuMetricsSource,
} from "./types.js";

type SourceOrder = Awaited<ReturnType<OrderMetricsSource["listOrders"]>>[number];

/** Inclusive bounds on both ends -- matches OrderRepository/other listAll-style range filters elsewhere in this repo. */
function withinRange(isoTimestamp: string, range: { from: string; to: string }): boolean {
  const t = new Date(isoTimestamp).getTime();
  return t >= new Date(range.from).getTime() && t <= new Date(range.to).getTime();
}

function filterByCreatedAt(orders: SourceOrder[], range?: { from: string; to: string }): SourceOrder[] {
  if (!range) return orders;
  return orders.filter((order) => withinRange(order.createdAt, range));
}

/**
 * Bucket-key rules (deliberately simple UTC-based ISO truncation -- this is
 * a reference implementation, not a timezone-perfect analytics engine, see
 * bi-02's documented risk mitigation):
 *  - day:   date portion of the UTC ISO string, e.g. "2026-03-05"
 *  - month: year+month portion, e.g. "2026-03"
 *  - week:  ISO-8601 week number (Monday-start, week 1 contains the year's
 *           first Thursday), e.g. "2026-W10"
 */
function isoWeekBucket(createdAt: string): string {
  const source = new Date(createdAt);
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const isoDayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - isoDayNum + 3); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 4)); // Jan 4 is always in week 1
  const yearStartDayNum = (yearStart.getUTCDay() + 6) % 7;
  yearStart.setUTCDate(yearStart.getUTCDate() - yearStartDayNum + 3);
  const weekNumber = 1 + Math.round((date.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function bucketKey(createdAt: string, bucket: "day" | "week" | "month"): string {
  if (bucket === "day") return new Date(createdAt).toISOString().slice(0, 10);
  if (bucket === "month") return new Date(createdAt).toISOString().slice(0, 7);
  return isoWeekBucket(createdAt);
}

/** Currency for a bare-number aggregate -- same single-currency-deployment assumption checkout-orders/promotions already make (see their own `items[0]?.priceSnapshot.currency ?? "USD"` convention). */
function currencyOf(order: SourceOrder): string {
  return order.items[0]?.priceAtPurchase.currency ?? order.discountTotal.currency ?? "USD";
}

const FUNNEL_STAGES: { eventType: string; stage: string }[] = [
  { eventType: "cart.item.added", stage: "item_added" },
  { eventType: "checkout.order.placed", stage: "checkout_started" },
  { eventType: "checkout.order.paid", stage: "order_paid" },
];

/**
 * The default reference BiMetricsAdapter (subsystem 20) -- computes revenue/
 * order-volume/top-products/promotion-redemption on demand straight from the
 * injected structural sources, and the conversion funnel from the injected
 * BiEventLogRepository (populated separately by registerBiEventLogSync).
 * getInventoryTurns always resolves null -- see types.ts's BiMetricsAdapter
 * doc comment and docs/subsystems/20-internal-bi.md.
 */
export function createDefaultBiAdapter(deps: {
  orders: OrderMetricsSource;
  skus: SkuMetricsSource;
  promotions: PromotionMetricsSource;
  eventLog: BiEventLogRepository;
  /** Lines/catalogs/categories for getSalesByCollection. Optional. */
  collections?: CollectionMetricsSource;
}): BiMetricsAdapter {
  const { orders, skus, promotions, eventLog, collections } = deps;

  return {
    async getSalesByCollection(options = {}) {
      if (!collections) return [];
      const { range, kind, withinWindow = true, topProductsLimit = 5 } = options;
      const allOrders = (await orders.listOrders()).filter((o) => o.status !== "cancelled" && o.status !== "pending_payment" && o.status !== "abandoned");
      const productBySku = new Map<string, string | null>();
      const productOf = async (skuId: string) => {
        if (!productBySku.has(skuId)) productBySku.set(skuId, (await skus.getSku(skuId))?.productId ?? null);
        return productBySku.get(skuId)!;
      };
      const titles = new Map<string, string>();
      const titleOf = async (productId: string) => {
        if (!titles.has(productId)) titles.set(productId, (await skus.getProduct(productId))?.title ?? "Unknown product");
        return titles.get(productId)!;
      };
      const results: CollectionSales[] = [];
      for (const collection of await collections.listCollections()) {
        if (kind && collection.kind !== kind) continue;
        const members = new Set(await collections.productIdsInCollection(collection.id));
        const from = withinWindow ? (collection.activeFrom ?? null) : (range?.from ?? null);
        const to = withinWindow ? (collection.activeTo ?? null) : (range?.to ?? null);
        const inPeriod = (iso: string) => (!from || Date.parse(iso) >= Date.parse(from)) && (!to || Date.parse(iso) < Date.parse(to));
        let orderCount = 0;
        let units = 0;
        let revenue = 0;
        let currency = "USD";
        const byProduct = new Map<string, { units: number; revenue: number }>();
        for (const order of allOrders) {
          if (!inPeriod(order.createdAt)) continue;
          let counted = false;
          for (const item of order.items) {
            const productId = await productOf(item.skuId);
            if (!productId || !members.has(productId)) continue;
            counted = true;
            units += item.quantity;
            revenue += item.priceAtPurchase.amount * item.quantity;
            currency = item.priceAtPurchase.currency;
            const agg = byProduct.get(productId) ?? { units: 0, revenue: 0 };
            agg.units += item.quantity;
            agg.revenue += item.priceAtPurchase.amount * item.quantity;
            byProduct.set(productId, agg);
          }
          if (counted) orderCount++;
        }
        const top = [...byProduct].sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, topProductsLimit);
        results.push({
          collectionId: collection.id,
          name: collection.name,
          kind: collection.kind,
          period: { from, to },
          orders: orderCount,
          unitsSold: units,
          revenue: { amount: revenue, currency },
          productsSold: byProduct.size,
          productCount: members.size,
          topProducts: await Promise.all(top.map(async ([productId, agg]) => ({ productId, title: await titleOf(productId), unitsSold: agg.units, revenue: { amount: agg.revenue, currency } }))),
        });
      }
      return results.sort((a, b) => b.revenue.amount - a.revenue.amount);
    },

    async getRevenueOverTime(range, bucket) {
      const allOrders = await orders.listOrders();
      const eligible = allOrders.filter((order) => order.status !== "cancelled" && order.status !== "abandoned" && withinRange(order.createdAt, range));

      const totals = new Map<string, number>();
      let currency = "USD";
      for (const order of eligible) {
        const subtotal = order.items.reduce((sum, item) => sum + item.priceAtPurchase.amount * item.quantity, 0);
        const revenue = subtotal - order.discountTotal.amount;
        const key = bucketKey(order.createdAt, bucket);
        totals.set(key, (totals.get(key) ?? 0) + revenue);
        currency = currencyOf(order);
      }

      return Array.from(totals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucketLabel, revenue]) => ({ bucket: bucketLabel, revenue: { amount: revenue, currency } satisfies Money }));
    },

    async getOrderVolume(range) {
      const allOrders = await orders.listOrders();
      const eligible = filterByCreatedAt(allOrders, range);

      const byStatus: Record<string, number> = {};
      for (const order of eligible) {
        byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
      }

      return { total: eligible.length, byStatus };
    },

    async getTopProducts(range, limit = 10) {
      const allOrders = await orders.listOrders();
      const eligible = filterByCreatedAt(allOrders, range);

      const bySku = new Map<string, { unitsSold: number; revenue: number; currency: string }>();
      for (const order of eligible) {
        for (const item of order.items) {
          const existing = bySku.get(item.skuId) ?? { unitsSold: 0, revenue: 0, currency: item.priceAtPurchase.currency };
          existing.unitsSold += item.quantity;
          existing.revenue += item.priceAtPurchase.amount * item.quantity;
          bySku.set(item.skuId, existing);
        }
      }

      const ranked = Array.from(bySku.entries())
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .slice(0, limit);

      const results: { productId: string; title: string; unitsSold: number; revenue: Money }[] = [];
      for (const [skuId, agg] of ranked) {
        const sku = await skus.getSku(skuId);
        const product = sku ? await skus.getProduct(sku.productId) : null;
        results.push({
          productId: product?.id ?? sku?.productId ?? skuId,
          title: product?.title ?? "Unknown product",
          unitsSold: agg.unitsSold,
          revenue: { amount: agg.revenue, currency: agg.currency },
        });
      }
      return results;
    },

    async getConversionFunnel(range) {
      const events = await eventLog.list();
      const eligible = range ? events.filter((event) => withinRange(event.occurredAt, range)) : events;

      const counts = new Map<string, number>();
      for (const event of eligible) {
        counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
      }

      return FUNNEL_STAGES.map(({ eventType, stage }) => ({ stage, count: counts.get(eventType) ?? 0 }));
    },

    async getPromotionRedemptionRates() {
      const list = await promotions.listPromotions();
      return list.map((promotion) => ({
        promotionId: promotion.id,
        code: promotion.code,
        redemptionCount: promotion.redemptionCount,
        usageLimit: promotion.usageLimit,
      }));
    },

    // Deliberate non-goal for v1: no inventory movement history exists anywhere in this
    // repo (inventory tracks only a current onHand/reserved snapshot), so this is never
    // computable in the reference implementation. Always null -- never a fabricated
    // number, never throws. See design-discussion.md section 4.
    async getInventoryTurns() {
      return null;
    },
  };
}
