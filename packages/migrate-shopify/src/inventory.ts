import type { LocationInventory, ShopifyInventoryLevelNode, VariantInventorySnapshot } from "./types.js";

/**
 * Multi-location-to-single-location inventory decision.
 *
 * Verified directly against Shopify's current Admin GraphQL docs
 * (shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel and
 * .../InventoryQuantity, fetched 2026-10-07): a `ProductVariant` has exactly
 * one `InventoryItem`, which has one `InventoryLevel` *per location* it's
 * stocked at, and each level's sellable/physical quantity is read via
 * `quantities(names: [...])`, where the real, documented quantity-state
 * names include (among others) "on_hand" ("the total number of units that
 * are physically at a location") and "available" ("inventory [that] isn't
 * committed to any orders and isn't part of incoming transfers").
 *
 * This repo's own native inventory model
 * (packages/inventory/src/types.ts, `StockLevel`/`InventoryAdapter`) is
 * deliberately single-location: one `onHand` number per SKU, with `reserved`
 * tracked separately and entirely by this app's own order flow (see
 * InventoryAdapter.reserve/commit/release) -- there is no location
 * dimension anywhere in that model, and adding one is out of scope for this
 * read-only migration slice.
 *
 * The decision: sum each variant's Shopify "on_hand" quantity across every
 * location it has a level at, and treat that sum as the value to seed into
 * the native `onHand` field. "on_hand" (not "available") is the right
 * Shopify quantity to map, not "available", because our `onHand` is defined
 * as the *physical* stock count, independent of reservations -- our own
 * `reserved` tracking starts at zero the moment a SKU is imported (nothing
 * has been reserved against the native store yet), so importing Shopify's
 * already-netted "available" number would double-subtract commitments that
 * belong to Shopify orders this tool explicitly does not migrate (orders
 * are out of scope -- see this epic's design-discussion.md). Summing
 * on_hand across every location is also the only aggregation that can't
 * silently undercount: a merchant with stock split across three warehouses
 * still has all of it once everything lands in one native store with one
 * stock number.
 *
 * What is NOT silently dropped: this function also returns the full
 * per-location breakdown (`locations`), independent of raw `available` per
 * location too. Nothing about this collapsing decision is hidden -- a human
 * reviewing a dry run (or the later write-path tool, if it ever grows a
 * per-location feature) can see exactly what was summed and from where.
 */
export function summarizeInventory(levels: ShopifyInventoryLevelNode[]): VariantInventorySnapshot {
  const locations: LocationInventory[] = levels.map((level) => ({
    locationId: level.location.id,
    locationName: level.location.name,
    onHand: quantityNamed(level, "on_hand"),
    available: quantityNamed(level, "available"),
  }));
  const onHand = locations.reduce((sum, location) => sum + location.onHand, 0);
  return { onHand, locations };
}

function quantityNamed(level: ShopifyInventoryLevelNode, name: string): number {
  return level.quantities.find((q) => q.name === name)?.quantity ?? 0;
}
