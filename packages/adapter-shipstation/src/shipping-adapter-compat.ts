import type { ShippingAdapter } from "@mercatus-liber/shipping";
import { createShipStationShippingAdapter, type ShipStationShippingAdapterConfig } from "./index.js";

/**
 * Compile-time proof that the adapter satisfies ShippingAdapter, including
 * the optional voidLabel. Lives in src/ (not test/) so `tsc --noEmit` checks
 * it on every typecheck/build, same as adapter-shippo's compat file: vitest
 * strips types without checking them. No casts. If the adapter's return
 * type drifts from the interface, the build fails.
 */
export function assertShipStationAdapterSatisfiesShippingAdapter(config: ShipStationShippingAdapterConfig): ShippingAdapter & Required<Pick<ShippingAdapter, "voidLabel">> {
  return createShipStationShippingAdapter(config);
}
