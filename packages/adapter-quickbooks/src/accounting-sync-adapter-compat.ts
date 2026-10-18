import type { AccountingSyncAdapter } from "@mercatus-liber/accounting-sync";
import { createQuickBooksAccountingSyncAdapter, type QuickBooksAccountingSyncAdapterConfig } from "./index.js";

/**
 * Real type-compatibility proof, same discipline as
 * `@mercatus-liber/adapter-printful`'s `fulfillment-adapter-compat.ts`: this
 * file lives in `src/` (not `test/`) specifically so `tsc -p tsconfig.json
 * --noEmit` (this package's `typecheck` script, a prerequisite of `build`)
 * re-checks it on every build -- this package's tsconfig `include` is
 * `["src"]` only.
 *
 * The body is the proof: a bare
 * `return createQuickBooksAccountingSyncAdapter(config);` type-checks only
 * if the adapter's real return value structurally satisfies
 * `AccountingSyncAdapter`'s full contract -- `syncOrder` (required) plus
 * the optional `handleWebhookEvent` this adapter also implements -- with
 * zero casts.
 */
export function assertQuickBooksAdapterSatisfiesAccountingSyncAdapter(
  config: QuickBooksAccountingSyncAdapterConfig,
): AccountingSyncAdapter {
  return createQuickBooksAccountingSyncAdapter(config);
}
