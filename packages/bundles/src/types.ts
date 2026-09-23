import type { Money } from "@mercatus-liber/core";

export type BundleStatus = "active" | "inactive";

/**
 * One selectable tier of a Bundle -- e.g. "Product Only" / "+ Pro Setup" /
 * "Complete Overhaul". `label` is free text (no hardcoded tier vocabulary --
 * any deployment names its own tiers). `skuIds` is the FULL set of SKUs to
 * add to cart when this tier is selected, explicit per tier and never a
 * delta from the previous tier -- avoids any accumulation ambiguity.
 */
export interface BundleTier {
  id: string;
  label: string;
  skuIds: string[];
}

/**
 * A curated, cross-product selection of SKUs sold from a single PDP as one
 * of several ordered tiers. References its base product by id only (never
 * forks/extends @mercatus-liber/core's Product/Sku shapes -- see
 * docs/subsystems/17-bundles.md and design-discussion.md §3). Selecting a
 * tier becomes N ordinary per-SKU cart lines, orchestrated at the app layer
 * -- bundles never becomes a new line-item shape cart/checkout-orders/
 * promotions/inventory have to learn.
 */
export interface Bundle {
  id: string;
  /** The base product this bundle is attached to/rendered from on the PDP. */
  productId: string;
  title: string;
  tiers: BundleTier[];
  status: BundleStatus;
  /**
   * Which demo store this bundle belongs to. Optional/additive, same shape
   * and reason as `Page.demoSlug` (epic 60), `Category.demoSlug` (epic 61),
   * and `ServiceArea.demoSlug` (commerce-gap-audit-3) -- a real, disclosed
   * gap found by `commerce-gap-audit-3` §13: `BundleRepository.list()` had
   * no demo-scoping concept at all, so under the shared Postgres backend
   * print-shop and Northline Home Tech both resolve to, an operator in
   * print-shop's own `/admin/bundles` list saw Northline's bundles mixed
   * into their own list (admin-only bleed -- `getBundleForProduct` is
   * deliberately left unscoped since it already resolves correctly by
   * `productId`, which is itself already demo-scoped on the PDP).
   * `undefined`/missing behaves exactly as before this fix (an unscoped
   * call still sees every bundle).
   */
  demoSlug?: string;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface BundleRepository {
  get(id: string): Promise<Bundle | null>;
  list(filter?: { demoSlug?: string }): Promise<Bundle[]>;
  save(bundle: Bundle): Promise<void>;
}

/**
 * The narrowest possible read dependency bundles has on catalog data -- a
 * structural interface, not an import of @mercatus-liber/catalog.
 * @mercatus-liber/catalog's CatalogService satisfies this shape already;
 * bundles' source never imports that package (only app-composition code,
 * e.g. apps/reference-storefront, wires a real implementation in). Used to
 * validate a tier's skuIds at write time and to compute a tier's live
 * sum-of-parts price at read time (see computeTierPricing).
 */
export interface SkuPriceLookup {
  getSku(id: string): Promise<{ id: string; price: Money; title?: string } | null>;
}

/** One priced line in a computeTierPricing() result -- one per constituent skuId. */
export interface TierPricingLine {
  skuId: string;
  title: string;
  unitAmount: Money;
}

/**
 * The live, sum-of-parts price of a tier -- always recomputed from current
 * SkuPriceLookup data, never cached/snapshotted into the Bundle record
 * itself. See design-discussion.md §4: this guarantees the PDP's displayed
 * tier price and the cart's actual line-item total can never drift out of
 * sync, since both ultimately read the same catalog SKU prices.
 */
export interface TierPricing {
  total: Money;
  lines: TierPricingLine[];
}

/** Input to BundlesService.createBundle -- id is always service-assigned; status defaults to "active". */
export type CreateBundleInput = Omit<Bundle, "id" | "status"> & {
  status?: BundleStatus;
};

/**
 * Thrown by createBundle/updateBundle/computeTierPricing when a referenced
 * skuId cannot be resolved via SkuPriceLookup -- names the offending skuId
 * so a caller (e.g. the admin UI) can surface a clear, actionable error.
 * createBundle/updateBundle reject the whole call: no Bundle is persisted
 * and no existing Bundle is mutated.
 */
export class BundleSkuNotFoundError extends Error {
  constructor(skuId: string) {
    super(`SKU not found: ${skuId}`);
    this.name = "BundleSkuNotFoundError";
  }
}

/**
 * Thrown by computeTierPricing when a tier's constituent SKUs resolve to
 * more than one currency. A tier's price is a single Money total, so a
 * currency mismatch has no well-defined sum -- rejecting clearly here (never
 * silently summing mismatched currencies) is the chosen failure behavior,
 * per the risk noted in bundle-01-bundles-subsystem.yaml.
 */
export class BundleCurrencyMismatchError extends Error {
  constructor(tierId: string) {
    super(`Tier ${tierId} has constituent SKUs spanning more than one currency`);
    this.name = "BundleCurrencyMismatchError";
  }
}
