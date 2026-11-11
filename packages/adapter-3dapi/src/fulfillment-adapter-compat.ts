import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createDapiFulfillmentAdapter, type DapiFulfillmentAdapterConfig } from "./index.js";

/**
 * Compile-time proof that the adapter satisfies FulfillmentAdapter with no
 * casts. It lives in src/ so `tsc` checks it on every build, as the same file
 * in adapter-printful does.
 */
export function assertDapiAdapterSatisfiesFulfillmentAdapter(config: DapiFulfillmentAdapterConfig): FulfillmentAdapter {
  return createDapiFulfillmentAdapter(config);
}
