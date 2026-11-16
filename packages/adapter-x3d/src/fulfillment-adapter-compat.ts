import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createX3dFulfillmentAdapter, type X3dFulfillmentAdapterConfig } from "./index.js";

/** Compile-time check, run by every build and typecheck: the adapter satisfies FulfillmentAdapter with no casts. */
export function assertX3dAdapterSatisfiesFulfillmentAdapter(config: X3dFulfillmentAdapterConfig): FulfillmentAdapter {
  return createX3dFulfillmentAdapter(config);
}
