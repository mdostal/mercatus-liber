import type { Money } from "@mercatus-liber/core";

/**
 * The narrowest read dependency this package has on order data -- a
 * structural interface, not an import of the checkout-orders package.
 * checkout-orders' CheckoutOrdersService/OrderRepository satisfies this
 * shape already (Order carries all of these fields, including createdAt --
 * see bi-01).
 */
export interface OrderMetricsSource {
  listOrders(): Promise<
    {
      id: string;
      items: { skuId: string; quantity: number; priceAtPurchase: Money }[];
      status: string;
      createdAt: string;
      discountTotal: Money;
    }[]
  >;
}

/**
 * The narrowest read dependency this package has on catalog data -- a
 * structural interface, not an import of the catalog package.
 * catalog's CatalogService satisfies this shape already.
 */
export interface SkuMetricsSource {
  getSku(id: string): Promise<{ id: string; productId: string; price: Money } | null>;
  getProduct(id: string): Promise<{ id: string; title: string } | null>;
}

/**
 * The narrowest read dependency this package has on promotions data -- a
 * structural interface, not an import of the promotions package.
 * promotions' PromotionsService satisfies this shape already.
 */
export interface PromotionMetricsSource {
  listPromotions(): Promise<
    { id: string; code: string | null; redemptionCount: number; usageLimit: number | null }[]
  >;
}

/**
 * The swappable contract (subsystem 20) -- mirrors CatalogPersistenceAdapter/
 * CmsPersistenceAdapter: a single named interface a deployment can later
 * implement against a real external BI tool (warehouse export, Metabase/
 * Looker), with `createDefaultBiAdapter` (service.ts) as the zero-infra
 * reference implementation shipped in this package. See
 * .pHive/epics/internal-bi-metrics/docs/design-discussion.md section 3.
 */
export interface BiMetricsAdapter {
  getRevenueOverTime(
    range: { from: string; to: string },
    bucket: "day" | "week" | "month",
  ): Promise<{ bucket: string; revenue: Money }[]>;
  getOrderVolume(range?: { from: string; to: string }): Promise<{ total: number; byStatus: Record<string, number> }>;
  getTopProducts(
    range?: { from: string; to: string },
    limit?: number,
  ): Promise<{ productId: string; title: string; unitsSold: number; revenue: Money }[]>;
  getConversionFunnel(range?: { from: string; to: string }): Promise<{ stage: string; count: number }[]>;
  getPromotionRedemptionRates(): Promise<
    { promotionId: string; code: string | null; redemptionCount: number; usageLimit: number | null }[]
  >;
  /**
   * v1: never computable in the reference implementation -- no inventory
   * movement history exists anywhere in this repo (inventory tracks only a
   * current onHand/reserved snapshot). Always resolves null; a future
   * adapter backed by a real inventory-history store can implement this for
   * real. See design-discussion.md section 4 and docs/subsystems/20-internal-bi.md.
   */
  getInventoryTurns(range?: { from: string; to: string }): Promise<null>;
}

/**
 * One raw occurrence of a bus event this subsystem cares about for the
 * conversion funnel, captured strictly going forward from the moment
 * registerBiEventLogSync is wired -- no backfill of history that happened
 * before it existed (the event bus itself retains nothing).
 */
export interface BiEvent {
  id: string;
  eventType: string;
  /** ISO 8601, set by the subscriber at the moment it fires -- never taken from the event payload. */
  occurredAt: string;
  payload: Record<string, unknown>;
}

/**
 * The funnel's own minimal persisted state -- adapter pattern, as everywhere
 * else in this codebase. append-only; list() returns every recorded event.
 */
export interface BiEventLogRepository {
  append(event: BiEvent): Promise<void>;
  list(): Promise<BiEvent[]>;
}
