import type { FulfillmentProviderKey } from "@mercatus-liber/fulfillment";

/** The fulfillment provider key this package registers under. */
export const SIMPLYPRINT_PROVIDER: FulfillmentProviderKey = "simplyprint";

/**
 * The provider key simplyPrintPrintLogFrom keeps its "this queue item finished
 * printing" markers under, in the same ProviderOrderLinkRepository as the
 * queue items themselves. It is not a fulfillment provider: nothing routes to
 * it and no adapter is registered under it.
 */
export const SIMPLYPRINT_PRINTED_MARKER: FulfillmentProviderKey = "simplyprint:printed";
