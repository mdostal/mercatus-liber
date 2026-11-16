/**
 * The parts of SimplyPrint's API this package uses, as its documents give
 * them (https://apidocs.simplyprint.io and the per-endpoint files under
 * https://apidocs.simplyprint.io/static/, read 2026-11-15). Only documented
 * fields are named here. Nothing in this package was run against a live
 * SimplyPrint account.
 */

/** Every response carries these two. `status: false` is an error, whatever the HTTP status. */
export interface SimplyPrintEnvelope {
  status: boolean;
  message: string | null;
}

/** `{ string }` is the documented submission value of a text custom field. */
export interface SimplyPrintCustomFieldSubmission {
  customFieldId: string;
  value: { string: string };
}

/** The body of POST /{companyId}/queue/AddItem. */
export interface SimplyPrintAddQueueItemRequest {
  /** The id of a file in the account's file library ("filesystem id"), such as "1a077dd6296417fe75555bf806b68089". */
  filesystem: string;
  /** How many prints to queue. SimplyPrint's default is 1. */
  amount: number;
  /** Queue group id. SimplyPrint: "Default: 0 - required if you have Queue Groups". */
  group?: number;
  /** Custom tags, in the body shape of tags/Assign's custom tag: the first id as `tag_id`, the full list as `custom`. */
  tags?: { tag_id: number; custom: number[] };
  custom_fields?: SimplyPrintCustomFieldSubmission[];
}

/** The approval statuses SimplyPrint documents for a queue item (GetPaginatedItems, `approval_status`). */
export const SIMPLYPRINT_APPROVAL_STATUSES = ["not_required", "pending", "approved", "denied", "revision"] as const;

/**
 * A queue item as GetPaginatedItems (v=2) returns it. SimplyPrint documents
 * many more fields; these are the ones this package reads. All but `id` are
 * optional here because the documents call several of them "only present when
 * relevant".
 */
export interface SimplyPrintQueueItem {
  id: number;
  filename?: string;
  note?: string | null;
  /** Prints remaining. */
  left?: number;
  /** Prints completed. */
  printed?: number;
  /** Queue group id, 0 when ungrouped. */
  group?: number;
  /** True if the item is finished. */
  is_done?: boolean;
  paused?: boolean;
  /** Copies currently printing. */
  ongoing?: number;
  /** Failed prints. */
  failed?: number;
  /** Present when approval is required. */
  approval?: { status?: string };
}

/** The slices of the queue GetPaginatedItems can return (`filter`). "all" is documented too and not used here. */
export const SIMPLYPRINT_QUEUE_SLICES = ["active", "pending", "done"] as const;
export type SimplyPrintQueueSlice = (typeof SIMPLYPRINT_QUEUE_SLICES)[number];

/** A queue item and the slice of the queue it was listed in. */
export interface SimplyPrintListedQueueItem {
  slice: SimplyPrintQueueSlice;
  item: SimplyPrintQueueItem;
}

/** The envelope of every webhook delivery. */
export interface SimplyPrintWebhookEvent {
  webhook_id: number;
  /** Such as "job.done" or "queue.delete_item". */
  event: string;
  /** Unix seconds. */
  timestamp: number;
  data: Record<string, unknown>;
}

/** The webhook events this package acts on. SimplyPrint documents about sixty more. */
export const SIMPLYPRINT_QUEUE_ITEM_DELETED_EVENT = "queue.delete_item";
export const SIMPLYPRINT_QUEUE_ITEM_DENIED_EVENT = "queue.item_denied";
export const SIMPLYPRINT_JOB_EVENTS = ["job.started", "job.paused", "job.resumed", "job.cancelled", "job.done", "job.failed"] as const;

/** The header a webhook's secret arrives in. */
export const SIMPLYPRINT_WEBHOOK_SECRET_HEADER = "X-SP-Secret";
