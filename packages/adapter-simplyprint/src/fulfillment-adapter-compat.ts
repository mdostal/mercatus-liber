import type { FulfillmentAdapter } from "@mercatus-liber/fulfillment";
import { createSimplyPrintFulfillmentAdapter, type SimplyPrintFulfillmentAdapterConfig } from "./index.js";

/** Compile-time check, run by every build and typecheck: the adapter satisfies FulfillmentAdapter with no casts. */
export function assertSimplyPrintAdapterSatisfiesFulfillmentAdapter(config: SimplyPrintFulfillmentAdapterConfig): FulfillmentAdapter {
  return createSimplyPrintFulfillmentAdapter(config);
}
