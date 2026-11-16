import {
  InvalidCatalogMappingError,
  requireCatalogTarget,
  type FulfillmentAdapter,
  type FulfillmentLineRecord,
  type ProviderCatalogMappingRepository,
  type ProviderOrderLinkRepository,
  type ProviderOrderStatusOutcome,
  type ProviderOrderStatusUpdate,
  type SubmitFulfillmentOrderInput,
} from "@mercatus-liber/fulfillment";
import { createSimplyPrintHttpClient, SimplyPrintApiError, type SimplyPrintHttpClient } from "./http-client.js";
import {
  buildSimplyPrintLineRecords,
  mapSimplyPrintPrintState,
  parseSimplyPrintCatalogTarget,
  simplyPrintPrintStateOf,
  simplyPrintQueueNote,
  simplyPrintStatusUpdateFrom,
  type SimplyPrintCatalogTarget,
  type SimplyPrintPrintState,
  type SimplyPrintStateMappingOptions,
} from "./mapping.js";
import { SIMPLYPRINT_PRINTED_MARKER, SIMPLYPRINT_PROVIDER } from "./provider.js";
import type { SimplyPrintAddQueueItemRequest, SimplyPrintListedQueueItem, SimplyPrintWebhookEvent } from "./simplyprint-types.js";
import {
  parseSimplyPrintWebhookEvent,
  simplyPrintWebhookActionFrom,
  simplyPrintWebhookSecretMatches,
  SimplyPrintWebhookSecretInvalidError,
  SimplyPrintWebhookSecretNotConfiguredError,
  type SimplyPrintWebhookAction,
} from "./webhook.js";

export * from "./provider.js";
export * from "./simplyprint-types.js";
export * from "./http-client.js";
export * from "./mapping.js";
export * from "./webhook.js";

/** Which SimplyPrint queue item was made for which line of which store order. */
export interface SimplyPrintOrderStore {
  /** Oldest first. `closed` is true once the item is known to be out of the queue for good (cancelled or denied). */
  list(orderId: string): Promise<{ queueItemId: string; skuIds: string[]; closed: boolean }[]>;
  /** Called straight after SimplyPrint accepts a queue item, before anything else is sent. */
  remember(orderId: string, skuId: string, queueItemId: string): Promise<void>;
  /** Marks an item as out of the queue for good, so its line can be queued again. */
  close(queueItemId: string): Promise<void>;
}

export function createInMemorySimplyPrintOrderStore(): SimplyPrintOrderStore {
  const byOrder = new Map<string, { queueItemId: string; skuIds: string[] }[]>();
  const closed = new Set<string>();
  return {
    async list(orderId) {
      return (byOrder.get(orderId) ?? []).map((entry) => ({ queueItemId: entry.queueItemId, skuIds: [...entry.skuIds], closed: closed.has(entry.queueItemId) }));
    },
    async remember(orderId, skuId, queueItemId) {
      byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), { queueItemId, skuIds: [skuId] }]);
    },
    async close(queueItemId) {
      closed.add(queueItemId);
    },
  };
}

/**
 * A SimplyPrintOrderStore kept in @mercatus-liber/fulfillment's provider order
 * links, so it survives a restart wherever those do. An item is closed when
 * its link's status is "unfulfilled", which is also what the status poller and
 * a recorded webhook set, so all three agree.
 */
export function simplyPrintOrderStoreFrom(links: ProviderOrderLinkRepository): SimplyPrintOrderStore {
  return {
    async list(orderId) {
      return (await links.listForOrder(orderId, SIMPLYPRINT_PROVIDER)).map((link) => ({ queueItemId: link.externalOrderId, skuIds: link.skuIds, closed: link.status === "unfulfilled" }));
    },
    async remember(orderId, skuId, queueItemId) {
      await links.link({ orderId, provider: SIMPLYPRINT_PROVIDER, externalOrderId: queueItemId, skuIds: [skuId] });
    },
    async close(queueItemId) {
      await links.saveStatus(SIMPLYPRINT_PROVIDER, queueItemId, { status: "unfulfilled", trackingNumber: null, carrier: null });
    },
  };
}

/**
 * "The print for order X, SKU Y changed state." This is the adapter's own
 * notice, separate from `fulfillment.order.status_changed`: the line statuses
 * have no word for "printed, ready to pack", so a printed line stays
 * "submitted" there and this says the rest.
 */
export interface SimplyPrintPrintNotice {
  /** The same for the same item in the same state. Key on it to act once. */
  noticeId: string;
  orderId: string;
  skuIds: string[];
  queueItemId: string;
  printState: SimplyPrintPrintState;
}

/** A name for publishing a "printed" SimplyPrintPrintNotice on an event bus. This package publishes nothing itself. */
export const SIMPLYPRINT_PRINT_FINISHED = "simplyprint.print.finished";

function noticeFor(link: { orderId: string; skuIds: string[] }, queueItemId: string, printState: SimplyPrintPrintState): SimplyPrintPrintNotice {
  return { noticeId: JSON.stringify([SIMPLYPRINT_PROVIDER, queueItemId, printState]), orderId: link.orderId, skuIds: [...link.skuIds], queueItemId, printState };
}

/**
 * Which queue items have been reported as printed. The poller stops reading a
 * printed item (SimplyPrint removes done items after a while, and the item
 * would then look missing), and reports each one once.
 */
export interface SimplyPrintPrintLog {
  has(queueItemId: string): Promise<boolean>;
  add(printed: { orderId: string; skuIds: string[]; queueItemId: string }): Promise<void>;
}

/** Forgets on restart: every item still listed as done is then reported as printed once more, with the same `noticeId`. */
export function createInMemorySimplyPrintPrintLog(): SimplyPrintPrintLog {
  const printed = new Set<string>();
  return {
    async has(queueItemId) {
      return printed.has(queueItemId);
    },
    async add({ queueItemId }) {
      printed.add(queueItemId);
    },
  };
}

/**
 * A SimplyPrintPrintLog kept in the provider order links, under the provider
 * key SIMPLYPRINT_PRINTED_MARKER, so it lasts as long as the links do without
 * a table of its own. The marker links carry no status and belong to no
 * adapter.
 */
export function simplyPrintPrintLogFrom(links: Pick<ProviderOrderLinkRepository, "link" | "findByExternalOrderId">): SimplyPrintPrintLog {
  return {
    async has(queueItemId) {
      return (await links.findByExternalOrderId(SIMPLYPRINT_PRINTED_MARKER, queueItemId)) !== null;
    },
    async add({ orderId, skuIds, queueItemId }) {
      await links.link({ orderId, provider: SIMPLYPRINT_PRINTED_MARKER, externalOrderId: queueItemId, skuIds });
    },
  };
}

export interface SimplyPrintFulfillmentAdapterConfig extends SimplyPrintStateMappingOptions {
  /** A SimplyPrint user's API token. Adding to the queue with a token needs the Print Farm plan or higher. */
  apiKey: string;
  /** The account id ("Company ID" on the panel's API tab). */
  companyId: string | number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** What a SKU prints as. Throw when the SKU has no mapping. See simplyPrintCatalogTargetsFrom. */
  resolveCatalogTarget(skuId: string): Promise<SimplyPrintCatalogTarget>;
  /**
   * Where queue items are remembered. SimplyPrint has no idempotency key, so
   * this is the only thing that stops a retried submit from queueing a line
   * twice. The default is in memory and forgets on restart; use
   * simplyPrintOrderStoreFrom with a durable repository.
   */
  orderStore?: SimplyPrintOrderStore;
  /** Which items were already reported printed. Default in memory; see simplyPrintPrintLogFrom. */
  printLog?: SimplyPrintPrintLog;
  /** Send nothing to SimplyPrint and report each line as "held". Release the order by submitting again with this unset. */
  holdOrders?: boolean;
  /** The queue group for SKUs whose target names none. Needed when the account has queue groups. */
  queueGroupId?: number;
  /** The id (slug) of a text custom field, made in SimplyPrint for print queue items, to put the store's order id in. */
  orderIdCustomFieldId?: string;
  /** The same, for the SKU id. */
  skuCustomFieldId?: string;
  /**
   * The order id and SKU are written to the queue item's note in a second
   * request, after the item exists and is remembered. If that request fails
   * the item still prints, without its note; the failure comes here instead
   * of failing the submit.
   */
  onNoteError?(error: unknown, item: { orderId: string; skuId: string; queueItemId: string }): void;
  /** The secret set on the webhook in SimplyPrint. Without it handleWebhookEvent refuses every delivery. */
  webhookSecret?: string;
  /** Called with each delivery that carried the right secret. */
  onWebhookEvent?(action: SimplyPrintWebhookAction, event: SimplyPrintWebhookEvent): void | Promise<void>;
}

/** SimplyPrint accepted a queue item but the store could not remember it. The item is in the queue; record `queueItemId` by hand, or delete it in SimplyPrint, before retrying. */
export class SimplyPrintQueueItemNotRememberedError extends Error {
  constructor(
    readonly orderId: string,
    readonly skuId: string,
    readonly queueItemId: string,
    options: { cause: unknown },
  ) {
    super(`SimplyPrint queue item ${queueItemId} was added for order ${orderId}, SKU ${skuId}, but could not be stored. Record it or delete it in SimplyPrint before submitting this order again, or the line will be printed twice.`, options);
    this.name = "SimplyPrintQueueItemNotRememberedError";
  }
}

/**
 * Queueing a line failed. `queued` are the records of the lines that were
 * queued before it, in this call or an earlier one; they are remembered, so
 * submitting the order again queues only what is missing.
 *
 * `outcomeUnknown` is true when the request got no usable answer: a network
 * failure or timeout, a 5xx, or a success whose body had no queue item id.
 * SimplyPrint may or may not have added the item. Look at the print queue in
 * SimplyPrint before submitting again.
 */
export class SimplyPrintSubmitError extends Error {
  constructor(
    readonly orderId: string,
    readonly skuId: string,
    readonly queued: FulfillmentLineRecord[],
    readonly outcomeUnknown: boolean,
    options: { cause: unknown },
  ) {
    super(
      outcomeUnknown
        ? `Adding order ${orderId}, SKU ${skuId} to the SimplyPrint queue got no usable answer. The item may have been queued; check the print queue in SimplyPrint before submitting again.`
        : `Adding order ${orderId}, SKU ${skuId} to the SimplyPrint queue failed. ${queued.length} other line(s) of this order are queued and will not be queued again.`,
      options,
    );
    this.name = "SimplyPrintSubmitError";
  }
}

export interface SimplyPrintPollResult {
  /** Open queue items looked up. */
  checked: number;
  /** Of those, how many had a new line status published. */
  published: number;
  /** Items found printed in this poll. Each item is reported here once. */
  finished: SimplyPrintPrintNotice[];
  /** Items a person should look at: a failed print, or an item SimplyPrint no longer lists. Repeated on every poll while it lasts. */
  attention: SimplyPrintPrintNotice[];
  /** Items whose status could not be recorded. The rest were still processed. */
  failed: { queueItemId: string; error: unknown }[];
}

export interface SimplyPrintStatusPollerDeps extends SimplyPrintStateMappingOptions {
  listQueueItems(): Promise<SimplyPrintListedQueueItem[]>;
  links: Pick<ProviderOrderLinkRepository, "listOpen">;
  record(update: ProviderOrderStatusUpdate): Promise<ProviderOrderStatusOutcome>;
  /** Use the adapter's own log (or build the poller with the adapter's createStatusPoller, which does). */
  printLog?: SimplyPrintPrintLog;
  /** Called once per item when it is first seen printed. If it throws, the item is reported again on the next poll. */
  onPrintFinished?(notice: SimplyPrintPrintNotice): void | Promise<void>;
}

/**
 * Reads the print queue and tells the store what changed. Each `poll()` takes
 * every SimplyPrint link that is still open and not yet reported printed,
 * reads the queue once (not once per item), and for each item:
 *
 * - hands its line status to `record` (normally
 *   createProviderOrderStatusRecorder's `record`, bound to this provider),
 *   which publishes `fulfillment.order.status_changed` when it changed;
 * - when the item is printed, calls `onPrintFinished` and lists it in
 *   `finished`, once.
 *
 * With nothing open it makes no request. A queue that cannot be read throws;
 * nothing is recorded from a partial read.
 *
 * SimplyPrint's API-key rate limit is per user per minute (60 on Pro, 180 on
 * Print Farm). One poll costs at least three requests, one per queue slice.
 */
export function createSimplyPrintStatusPoller(deps: SimplyPrintStatusPollerDeps): { poll(): Promise<SimplyPrintPollResult> } {
  const printLog = deps.printLog ?? createInMemorySimplyPrintPrintLog();
  const options: SimplyPrintStateMappingOptions = { missingMeansCancelled: deps.missingMeansCancelled ?? false };
  return {
    async poll() {
      const result: SimplyPrintPollResult = { checked: 0, published: 0, finished: [], attention: [], failed: [] };
      const open = [];
      for (const link of await deps.links.listOpen(SIMPLYPRINT_PROVIDER)) if (!(await printLog.has(link.externalOrderId))) open.push(link);
      if (open.length === 0) return result;

      const states = new Map<string, SimplyPrintPrintState>();
      for (const listed of await deps.listQueueItems()) states.set(String(listed.item.id), simplyPrintPrintStateOf(listed));

      for (const link of open) {
        const queueItemId = link.externalOrderId;
        try {
          const state = states.get(queueItemId) ?? "missing";
          result.checked += 1;
          if ((await deps.record(simplyPrintStatusUpdateFrom(queueItemId, state, options))) === "published") result.published += 1;
          const notice = noticeFor(link, queueItemId, state);
          if (state === "printed") {
            // The callback runs before the item is logged, so a callback that throws is tried again next poll.
            await deps.onPrintFinished?.(notice);
            await printLog.add(notice);
            result.finished.push(notice);
          } else if (state === "failed" || (state === "missing" && !options.missingMeansCancelled)) {
            result.attention.push(notice);
          }
        } catch (error) {
          result.failed.push({ queueItemId, error });
        }
      }
      return result;
    },
  };
}

export interface SimplyPrintFulfillmentAdapter extends FulfillmentAdapter {
  /**
   * Checks the delivery's secret, then passes what it means to
   * `onWebhookEvent`. `signature` is the value of the delivery's `X-SP-Secret`
   * header. Throws without calling `onWebhookEvent` when no secret is
   * configured or the header does not match.
   */
  handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void>;
  /** Every queue item remembered for an order, oldest first, with where it stands now. */
  getPrintStates(orderId: string): Promise<{ queueItemId: string; skuIds: string[]; printState: SimplyPrintPrintState }[]>;
  /** The whole print queue: active, pending and done items. */
  listQueueItems(): Promise<SimplyPrintListedQueueItem[]>;
  /** Deletes a queue item in SimplyPrint and closes it in the order store, so its line can be queued again. Publishes no event. */
  cancelQueueItem(queueItemId: string): Promise<void>;
  /** A status poller that shares this adapter's SimplyPrint client, print log and `missingMeansCancelled`. */
  createStatusPoller(deps: Pick<SimplyPrintStatusPollerDeps, "links" | "record" | "onPrintFinished">): { poll(): Promise<SimplyPrintPollResult> };
}

/**
 * A FulfillmentAdapter for a store that prints its own orders on printers
 * managed in SimplyPrint. Submitting an order adds one item to SimplyPrint's
 * print queue per order line, with the line's quantity as the item's amount.
 * It ships nothing: the store packs the part and buys the label itself.
 *
 * `submitOrder` resolves every line's mapping before sending anything. It then
 * queues the lines one at a time and remembers each as soon as SimplyPrint
 * accepts it. A line that already has a live queue item is not queued again;
 * one whose item was cancelled or denied is.
 *
 * Each item gets a note naming the order, the SKU and the quantity. queue/AddItem
 * has no note field, so the note is a second request (queue/UpdateItem). Custom
 * fields, when configured, go in the first.
 *
 * Built from SimplyPrint's published API documents and tested against a fake
 * of that API. It has not been run against a live SimplyPrint account.
 */
export function createSimplyPrintFulfillmentAdapter(config: SimplyPrintFulfillmentAdapterConfig): SimplyPrintFulfillmentAdapter {
  const client: SimplyPrintHttpClient = createSimplyPrintHttpClient({ apiKey: config.apiKey, companyId: config.companyId, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}), ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}) });
  const store = config.orderStore ?? createInMemorySimplyPrintOrderStore();
  const printLog = config.printLog ?? createInMemorySimplyPrintPrintLog();
  const options: SimplyPrintStateMappingOptions = { missingMeansCancelled: config.missingMeansCancelled ?? false };

  /**
   * Where each remembered item of an order stands. What the store already
   * knows is used first (closed, or logged as printed); SimplyPrint is read
   * only when some item is left to ask about.
   */
  async function printStates(orderId: string): Promise<{ queueItemId: string; skuIds: string[]; printState: SimplyPrintPrintState }[]> {
    const known: { queueItemId: string; skuIds: string[]; printState: SimplyPrintPrintState | null }[] = [];
    for (const entry of await store.list(orderId)) {
      const printState = entry.closed ? "cancelled" : (await printLog.has(entry.queueItemId)) ? "printed" : null;
      known.push({ queueItemId: entry.queueItemId, skuIds: entry.skuIds, printState });
    }
    if (known.every((entry) => entry.printState !== null)) return known as { queueItemId: string; skuIds: string[]; printState: SimplyPrintPrintState }[];
    const listed = new Map<string, SimplyPrintPrintState>();
    for (const item of await client.listQueueItems()) listed.set(String(item.item.id), simplyPrintPrintStateOf(item));
    return known.map((entry) => ({ ...entry, printState: entry.printState ?? listed.get(entry.queueItemId) ?? "missing" }));
  }

  function requestFor(input: SubmitFulfillmentOrderInput, item: { skuId: string; quantity: number }, target: SimplyPrintCatalogTarget): SimplyPrintAddQueueItemRequest {
    const group = target.queueGroupId ?? config.queueGroupId;
    const customFields = [
      ...(config.orderIdCustomFieldId ? [{ customFieldId: config.orderIdCustomFieldId, value: { string: input.orderId } }] : []),
      ...(config.skuCustomFieldId ? [{ customFieldId: config.skuCustomFieldId, value: { string: item.skuId } }] : []),
    ];
    return {
      filesystem: target.fileId,
      amount: item.quantity,
      ...(group !== undefined ? { group } : {}),
      ...(target.customTagIds?.length ? { tags: { tag_id: target.customTagIds[0]!, custom: target.customTagIds } } : {}),
      ...(customFields.length > 0 ? { custom_fields: customFields } : {}),
    };
  }

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const targets = new Map<string, SimplyPrintCatalogTarget>();
      for (const item of input.items) targets.set(item.skuId, await config.resolveCatalogTarget(item.skuId));

      // The newest item for a line decides: a line is live unless that item is out of the queue for good.
      const live = new Map<string, { queueItemId: string; printState: SimplyPrintPrintState }>();
      for (const entry of await printStates(input.orderId)) {
        for (const skuId of entry.skuIds) {
          if (mapSimplyPrintPrintState(entry.printState, options) === "unfulfilled") live.delete(skuId);
          else live.set(skuId, { queueItemId: entry.queueItemId, printState: entry.printState });
        }
      }

      const records: FulfillmentLineRecord[] = [];
      for (const item of input.items) {
        const existing = live.get(item.skuId);
        if (existing) {
          records.push(...buildSimplyPrintLineRecords(input.orderId, [item.skuId], existing.queueItemId, existing.printState, options));
          continue;
        }
        if (config.holdOrders) {
          records.push({ orderId: input.orderId, skuId: item.skuId, provider: SIMPLYPRINT_PROVIDER, externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null });
          continue;
        }

        let queueItemId: string;
        try {
          queueItemId = String((await client.addQueueItem(requestFor(input, item, targets.get(item.skuId)!))).queueItemId);
        } catch (err) {
          // An error SimplyPrint itself gave (4xx, or `status: false`) means it made nothing. Anything else leaves that open.
          const outcomeUnknown = !(err instanceof SimplyPrintApiError) || err.httpStatus >= 500;
          throw new SimplyPrintSubmitError(
            input.orderId,
            item.skuId,
            records.filter((record) => record.externalOrderId),
            outcomeUnknown,
            { cause: err },
          );
        }
        try {
          await store.remember(input.orderId, item.skuId, queueItemId);
        } catch (err) {
          throw new SimplyPrintQueueItemNotRememberedError(input.orderId, item.skuId, queueItemId, { cause: err });
        }
        try {
          await client.setQueueItemNote(Number(queueItemId), simplyPrintQueueNote(input.orderId, item.skuId, item.quantity));
        } catch (err) {
          config.onNoteError?.(err, { orderId: input.orderId, skuId: item.skuId, queueItemId });
        }
        records.push(...buildSimplyPrintLineRecords(input.orderId, [item.skuId], queueItemId, "queued"));
      }
      return records;
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      // The newest item for a line wins, whatever its state, so a cancelled line reads as unfulfilled.
      const bySku = new Map<string, FulfillmentLineRecord>();
      for (const entry of await printStates(orderId)) {
        for (const record of buildSimplyPrintLineRecords(orderId, entry.skuIds, entry.queueItemId, entry.printState, options)) bySku.set(record.skuId, record);
      }
      return [...bySku.values()];
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      if (!config.webhookSecret) throw new SimplyPrintWebhookSecretNotConfiguredError();
      if (!simplyPrintWebhookSecretMatches(signature, config.webhookSecret)) throw new SimplyPrintWebhookSecretInvalidError();
      const event = parseSimplyPrintWebhookEvent(rawBody);
      let action = simplyPrintWebhookActionFrom(event);
      // A printed item cleared out of the done list is not a cancelled print.
      if (action.kind === "queue_item_closed" && (await printLog.has(action.queueItemId))) action = { kind: "ignored" };
      await config.onWebhookEvent?.(action, event);
    },

    getPrintStates: printStates,
    listQueueItems: () => client.listQueueItems(),

    async cancelQueueItem(queueItemId: string): Promise<void> {
      await client.deleteQueueItem(Number(queueItemId));
      await store.close(queueItemId);
    },

    createStatusPoller: (deps) => createSimplyPrintStatusPoller({ ...deps, listQueueItems: () => client.listQueueItems(), printLog, ...options }),
  };
}

/**
 * A `resolveCatalogTarget` that reads stored mappings (see
 * @mercatus-liber/fulfillment's ProviderCatalogMappingRepository) and checks
 * each is a usable SimplyPrintCatalogTarget.
 */
export function simplyPrintCatalogTargetsFrom(repository: ProviderCatalogMappingRepository): (skuId: string) => Promise<SimplyPrintCatalogTarget> {
  return async (skuId) => {
    const parsed = parseSimplyPrintCatalogTarget(await requireCatalogTarget(repository, skuId, SIMPLYPRINT_PROVIDER));
    if (!parsed.ok) throw new InvalidCatalogMappingError(skuId, SIMPLYPRINT_PROVIDER, parsed.reason);
    return parsed.target;
  };
}
