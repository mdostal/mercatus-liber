import type { FulfillmentLineRecord, FulfillmentLineStatus, ProviderOrderStatusUpdate } from "@mercatus-liber/fulfillment";
import { SIMPLYPRINT_NOTE_MAX_LENGTH } from "./http-client.js";
import { SIMPLYPRINT_PROVIDER } from "./provider.js";
import type { SimplyPrintListedQueueItem } from "./simplyprint-types.js";

/**
 * Where a queue item stands, as this package names it. SimplyPrint has no
 * single state field on a queue item; simplyPrintPrintStateOf derives these
 * from the fields it does document.
 *
 * - "pending_approval": the account uses queue approval and nobody has approved the item yet.
 * - "queued": waiting for a printer.
 * - "paused": someone paused the item in SimplyPrint.
 * - "printing": at least one copy is on a printer now.
 * - "failed": a print of it failed and no copy is printing. The item is still in the queue.
 * - "printed": SimplyPrint marks the item done. Every copy is printed and waiting to be packed.
 * - "denied": an approver rejected it.
 * - "cancelled": it was deleted from the queue before printing.
 * - "missing": SimplyPrint no longer lists it and this package was not told why.
 */
export const SIMPLYPRINT_PRINT_STATES = ["pending_approval", "queued", "paused", "printing", "failed", "printed", "denied", "cancelled", "missing"] as const;
export type SimplyPrintPrintState = (typeof SIMPLYPRINT_PRINT_STATES)[number];

/**
 * The one place that reads a queue item's state out of SimplyPrint's fields:
 *
 * - `approval.status` "denied" -> "denied"; "pending" or "revision" -> "pending_approval".
 * - listed in the done slice, or `is_done` true -> "printed".
 * - `ongoing` above 0 -> "printing".
 * - `failed` above 0 -> "failed".
 * - `paused` true -> "paused".
 * - otherwise "queued".
 *
 * The field meanings are SimplyPrint's ("True if the item is finished",
 * "Copies currently printing", "Failed prints"). The order they are checked in
 * is this package's choice and has not been compared with a live queue. In
 * particular the documents do not say whether `failed` goes back to 0 when a
 * retry starts, which is why "printing" is checked first.
 */
export function simplyPrintPrintStateOf(listed: SimplyPrintListedQueueItem): SimplyPrintPrintState {
  const { item, slice } = listed;
  const approval = item.approval?.status;
  if (approval === "denied") return "denied";
  if (approval === "pending" || approval === "revision") return "pending_approval";
  if (slice === "done" || item.is_done === true) return "printed";
  if ((item.ongoing ?? 0) > 0) return "printing";
  if ((item.failed ?? 0) > 0) return "failed";
  if (item.paused === true) return "paused";
  // An item listed only in the pending slice with no approval object is still waiting on an approver.
  return slice === "pending" ? "pending_approval" : "queued";
}

export interface SimplyPrintStateMappingOptions {
  /**
   * What an item SimplyPrint no longer lists means. SimplyPrint's documents do
   * not say how to tell a deleted item from a finished one whose done entry
   * expired, so by default a missing item stays "submitted" and a person has
   * to look. Set this when the store runs no webhook and wants an item deleted
   * in the panel to free its line for queueing again.
   */
  missingMeansCancelled?: boolean;
}

/**
 * Print states onto this framework's line statuses.
 *
 * A printed part is not a shipped part, so nothing here maps to "shipped" or
 * "delivered": those come from the store's own label flow
 * (@mercatus-liber/fulfillment's recordSelfShipment). Everything from queued
 * to printed is "submitted". "denied" and "cancelled" are "unfulfilled": the
 * item is gone from the queue and the line can be queued again.
 *
 * "failed" is "submitted", not "unfulfilled". A failed print leaves its item
 * in the queue with copies still to print, so queueing the line again would
 * print it twice. To give up on an item, delete it in SimplyPrint (or call
 * cancelQueueItem); it then reads as "cancelled".
 */
export function mapSimplyPrintPrintState(state: SimplyPrintPrintState, options: SimplyPrintStateMappingOptions = {}): FulfillmentLineStatus {
  if (state === "denied" || state === "cancelled") return "unfulfilled";
  if (state === "missing" && options.missingMeansCancelled) return "unfulfilled";
  return "submitted";
}

/** One record per line the queue item prints. A queue item has no tracking: the store ships the part itself. */
export function buildSimplyPrintLineRecords(orderId: string, skuIds: string[], queueItemId: string, state: SimplyPrintPrintState, options: SimplyPrintStateMappingOptions = {}): FulfillmentLineRecord[] {
  return skuIds.map((skuId) => ({ orderId, skuId, provider: SIMPLYPRINT_PROVIDER, externalOrderId: queueItemId, status: mapSimplyPrintPrintState(state, options), trackingNumber: null, trackingUrl: null }));
}

/** A queue item's state as the status update @mercatus-liber/fulfillment's createProviderOrderStatusRecorder takes. */
export function simplyPrintStatusUpdateFrom(queueItemId: string, state: SimplyPrintPrintState, options: SimplyPrintStateMappingOptions = {}): ProviderOrderStatusUpdate {
  return { externalOrderId: queueItemId, status: mapSimplyPrintPrintState(state, options), trackingNumber: null, carrier: null };
}

/**
 * The note put on a queue item so a person at the printer can tell which order
 * it is for. Cut to SimplyPrint's 255 characters.
 */
export function simplyPrintQueueNote(orderId: string, skuId: string, quantity: number): string {
  return `Order ${orderId} | SKU ${skuId} | qty ${quantity}`.slice(0, SIMPLYPRINT_NOTE_MAX_LENGTH);
}

/**
 * What a SKU prints as in SimplyPrint. Stored as the `target` of the SKU's
 * provider catalog mapping.
 *
 * `fileId` is the id of a file already in the account's SimplyPrint file
 * library, sliced for the printers that will print it. For a multicolour part
 * that is a file sliced with its colours assigned. The adapter uploads
 * nothing; it queues the library file by id.
 */
export interface SimplyPrintCatalogTarget {
  fileId: string;
  /** The queue group to add the item to. Needed when the account has queue groups. */
  queueGroupId?: number;
  /** Ids of custom tags (made in SimplyPrint) to put on the queue item. */
  customTagIds?: number[];
}

/** Checks a stored mapping target is usable. Returns the target, or the reason it is not. */
export function parseSimplyPrintCatalogTarget(target: Record<string, unknown>): { ok: true; target: SimplyPrintCatalogTarget } | { ok: false; reason: string } {
  const fileId = typeof target.fileId === "string" ? target.fileId.trim() : "";
  if (!fileId) return { ok: false, reason: "fileId must be set to the id of a file in the SimplyPrint file library" };
  const isId = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min;
  const queueGroupId = target.queueGroupId;
  if (queueGroupId !== undefined && !isId(queueGroupId, 0)) return { ok: false, reason: "queueGroupId must be a whole number (0 means no group)" };
  const customTagIds = target.customTagIds;
  if (customTagIds !== undefined && (!Array.isArray(customTagIds) || !customTagIds.every((id) => isId(id, 1)))) return { ok: false, reason: "customTagIds must be a list of SimplyPrint custom tag ids" };
  return {
    ok: true,
    target: {
      fileId,
      ...(queueGroupId !== undefined ? { queueGroupId } : {}),
      ...(Array.isArray(customTagIds) && customTagIds.length > 0 ? { customTagIds: [...(customTagIds as number[])] } : {}),
    },
  };
}
