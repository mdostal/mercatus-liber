import type { ShippingAdapter } from "@mercatus-liber/shipping";
import { createShippoShippingAdapter, type ShippoShippingAdapterConfig } from "./index.js";

/**
 * Real type-compatibility proof for acceptance criterion 3 of
 * shipping-02-adapter-shippo-and-wiring -- NOT visual inspection. Lives in
 * src/ (not test/) for the same reason adapter-printify's own
 * fulfillment-adapter-compat.ts does: this package's tsconfig `include` is
 * `["src"]` only, so `tsc -p tsconfig.json --noEmit` (the `typecheck`
 * script, and a prerequisite of `build`) re-checks this file on every
 * build. A file under test/ would only ever be run through vitest's esbuild
 * transform, which strips types without validating them.
 *
 * The body is the proof: a bare `return createShippoShippingAdapter(config);`
 * type-checks only if createShippoShippingAdapter's return value
 * structurally satisfies ShippingAdapter's full contract -- all 3 required
 * methods (`getRates`, `buyLabel`, `getTrackingStatus`) with zero casts,
 * zero `as unknown as`, zero partial-implementation workaround. If
 * createShippoShippingAdapter's real return type ever drops or mis-shapes a
 * method ShippingAdapter requires, this function fails to compile and the
 * build goes red.
 */
export function assertShippoAdapterSatisfiesShippingAdapter(config: ShippoShippingAdapterConfig): ShippingAdapter {
  return createShippoShippingAdapter(config);
}
