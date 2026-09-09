import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createPrintifyFulfillmentAdapter, type PrintifyFulfillmentAdapterConfig } from "./index.js";

/**
 * Real type-compatibility proof for acceptance criterion 4 of
 * adapter-printify-01 -- NOT visual inspection. Lives in src/ (not test/) for
 * the same reason adapter-printful's own fulfillment-adapter-compat.ts does:
 * this package's tsconfig `include` is `["src"]` only, so `tsc -p
 * tsconfig.json --noEmit` (the `typecheck` script, and a prerequisite of
 * `build`) re-checks this file on every build. A file under test/ would only
 * ever be run through vitest's esbuild transform, which strips types without
 * validating them.
 *
 * The body is the proof: a bare `return createPrintifyFulfillmentAdapter(config);`
 * type-checks only if createPrintifyFulfillmentAdapter's return value
 * structurally satisfies FulfillmentAdapter's full contract -- every required
 * method (`submitOrder`, `getOrderStatus`) plus the optional
 * `handleWebhookEvent` this adapter also implements -- with zero casts, zero
 * `as unknown as`, zero partial-implementation workaround. If
 * createPrintifyFulfillmentAdapter's real return type ever drops or
 * mis-shapes a method FulfillmentAdapter requires, this function fails to
 * compile and the build goes red.
 */
export function assertPrintifyAdapterSatisfiesFulfillmentAdapter(config: PrintifyFulfillmentAdapterConfig): FulfillmentAdapter {
  return createPrintifyFulfillmentAdapter(config);
}
