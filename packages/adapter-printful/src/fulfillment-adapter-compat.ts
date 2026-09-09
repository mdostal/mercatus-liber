import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createPrintfulFulfillmentAdapter, type PrintfulFulfillmentAdapterConfig } from "./index.js";

/**
 * Real type-compatibility proof for acceptance criterion 4 of
 * adapter-printful-01 -- NOT visual inspection. Lives in src/ (not test/) for
 * the same reason fulfillment's own order-lookup-compat.ts does: this
 * package's tsconfig `include` is `["src"]` only, so `tsc -p tsconfig.json
 * --noEmit` (the `typecheck` script, and a prerequisite of `build`) re-checks
 * this file on every build. A file under test/ would only ever be run through
 * vitest's esbuild transform, which strips types without validating them.
 *
 * The body is the proof: a bare `return createPrintfulFulfillmentAdapter(config);`
 * type-checks only if createPrintfulFulfillmentAdapter's return value
 * structurally satisfies FulfillmentAdapter's full contract -- every required
 * method (`submitOrder`, `getOrderStatus`) plus the optional
 * `handleWebhookEvent` this adapter also implements -- with zero casts, zero
 * `as unknown as`, zero partial-implementation workaround. If
 * createPrintfulFulfillmentAdapter's real return type ever drops or
 * mis-shapes a method FulfillmentAdapter requires, this function fails to
 * compile and the build goes red.
 */
export function assertPrintfulAdapterSatisfiesFulfillmentAdapter(config: PrintfulFulfillmentAdapterConfig): FulfillmentAdapter {
  return createPrintfulFulfillmentAdapter(config);
}
