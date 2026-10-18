import type { PaymentAdapter } from "@mercatus-liber/payments";
import { createPaypalPaymentAdapter, type PaypalPaymentAdapterConfig } from "./index.js";

/**
 * Real type-compatibility proof, same pattern and same reason as
 * adapter-printify's own fulfillment-adapter-compat.ts: lives in src/ (not
 * test/) because this package's tsconfig `include` is `["src"]` only, so
 * `tsc -p tsconfig.json --noEmit` (the `typecheck` script, and a
 * prerequisite of `build`) re-checks this file on every build -- a file
 * under test/ would only ever be run through vitest's esbuild transform,
 * which strips types without validating them.
 *
 * The body is the proof: a bare `return createPaypalPaymentAdapter(config);`
 * type-checks only if createPaypalPaymentAdapter's return value structurally
 * satisfies PaymentAdapter's full contract (packages/payments/src/types.ts)
 * -- `createPaymentSession`, `confirmPayment`, `handleWebhookEvent` -- with
 * zero casts, zero `as unknown as`. If createPaypalPaymentAdapter's real
 * return type ever drops or mis-shapes a required method, this function
 * fails to compile and the build goes red.
 */
export function assertPaypalAdapterSatisfiesPaymentAdapter(config: PaypalPaymentAdapterConfig): PaymentAdapter {
  return createPaypalPaymentAdapter(config);
}
