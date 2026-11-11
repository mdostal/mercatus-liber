import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createSlant3dFulfillmentAdapter, type Slant3dFulfillmentAdapterConfig } from "./index.js";

/** Compile-time check, run by every build and typecheck: the adapter satisfies FulfillmentAdapter with no casts. */
export function assertSlant3dAdapterSatisfiesFulfillmentAdapter(config: Slant3dFulfillmentAdapterConfig): FulfillmentAdapter {
  return createSlant3dFulfillmentAdapter(config);
}
