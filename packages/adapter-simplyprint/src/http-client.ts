import { SIMPLYPRINT_QUEUE_SLICES, type SimplyPrintAddQueueItemRequest, type SimplyPrintListedQueueItem, type SimplyPrintQueueItem, type SimplyPrintQueueSlice } from "./simplyprint-types.js";

export const DEFAULT_SIMPLYPRINT_BASE_URL = "https://api.simplyprint.io";

/** The longest note SimplyPrint's queue/UpdateItem accepts. */
export const SIMPLYPRINT_NOTE_MAX_LENGTH = 255;

export interface SimplyPrintHttpClientConfig {
  /** A user's API token, sent as `X-API-KEY`. It acts with that user's permissions. */
  apiKey: string;
  /** The account id in every URL ("Company ID" on the panel's API tab). It is not an API version. */
  companyId: string | number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * SimplyPrint answered with an error: an HTTP error status, or a body whose
 * `status` is false. `simplyPrintMessage` is the body's `message`.
 * `retryAfterSeconds` is the `Retry-After` header of a 429, when sent.
 */
export class SimplyPrintApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly httpStatus: number,
    readonly simplyPrintMessage: string | null,
    readonly retryAfterSeconds: number | null,
    readonly body: unknown,
  ) {
    super(`SimplyPrint API error: ${method} ${path} -> HTTP ${httpStatus}${simplyPrintMessage ? `: ${simplyPrintMessage}` : ""}`);
    this.name = "SimplyPrintApiError";
  }
}

/** SimplyPrint answered with success but the body was not what its documents describe. */
export class SimplyPrintUnreadableResponseError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly body: unknown,
    detail: string,
  ) {
    super(`SimplyPrint answered ${method} ${path} with a body this package cannot read: ${detail}`);
    this.name = "SimplyPrintUnreadableResponseError";
  }
}

/**
 * The new queue item's id, from queue/AddItem's response.
 *
 * SimplyPrint's documents disagree on the field. The API reference
 * (apidocs.simplyprint.io, "Add item to queue") says `created_id`; the example
 * on simplyprint.io/features/api shows `id`. The reference is tried first,
 * then the other. null when neither is a number. This is the one place that
 * reads it.
 */
export function queueItemIdFromAddItemResponse(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["created_id", "id"]) if (typeof record[key] === "number" && Number.isInteger(record[key])) return record[key] as number;
  return null;
}

/** The part of SimplyPrint's API this package calls. No call here retries. */
export interface SimplyPrintHttpClient {
  /**
   * POST /{companyId}/queue/AddItem. Needs the Print Farm plan when called
   * with an API key. There is no idempotency key: sending the same item twice
   * queues it twice.
   */
  addQueueItem(request: SimplyPrintAddQueueItemRequest): Promise<{ queueItemId: number }>;
  /** POST /{companyId}/queue/UpdateItem?job={id} with `note`. Print Farm plan. A note longer than 255 characters is cut. */
  setQueueItemNote(queueItemId: number, note: string): Promise<void>;
  /**
   * GET /{companyId}/queue/GetPaginatedItems?v=2, every page of the active,
   * pending and done slices. Pro plan. An item listed in more than one slice
   * is returned once, from the later slice.
   */
  listQueueItems(): Promise<SimplyPrintListedQueueItem[]>;
  /** GET /{companyId}/queue/DeleteItem?job={id}. Print Farm plan. */
  deleteQueueItem(queueItemId: number): Promise<void>;
}

/** Stops listQueueItems reading forever if `page_amount` is wrong. 50 pages of 200 is 10,000 items per slice. */
const MAX_PAGES_PER_SLICE = 50;
const PAGE_SIZE = 200;

export function createSimplyPrintHttpClient(config: SimplyPrintHttpClientConfig): SimplyPrintHttpClient {
  const baseUrl = `${(config.baseUrl ?? DEFAULT_SIMPLYPRINT_BASE_URL).replace(/\/+$/, "")}/${encodeURIComponent(String(config.companyId))}`;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function send(method: "GET" | "POST", path: string, json?: unknown): Promise<Record<string, unknown>> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { "X-API-KEY": config.apiKey, accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    // SimplyPrint: "Responses always come back with a status boolean and an optional message".
    if (!response.ok || record?.status === false) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new SimplyPrintApiError(method, path, response.status, typeof record?.message === "string" ? record.message : null, response.headers.has("retry-after") && Number.isFinite(retryAfter) ? retryAfter : null, body);
    }
    if (!record || record.status !== true) throw new SimplyPrintUnreadableResponseError(method, path, body, "no `status: true`");
    return record;
  }

  async function listSlice(slice: SimplyPrintQueueSlice): Promise<SimplyPrintQueueItem[]> {
    const items: SimplyPrintQueueItem[] = [];
    for (let page = 1; page <= MAX_PAGES_PER_SLICE; page += 1) {
      // Page-based paging: SimplyPrint offers cursors only for the active slice.
      const path = `/queue/GetPaginatedItems?v=2&filter=${slice}&page=${page}&page_size=${PAGE_SIZE}`;
      const body = await send("GET", path);
      if (!Array.isArray(body.queue)) throw new SimplyPrintUnreadableResponseError("GET", path, body, "no `queue` array");
      for (const item of body.queue as unknown[]) {
        if (typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "number") items.push(item as SimplyPrintQueueItem);
      }
      const pageAmount = typeof body.page_amount === "number" ? body.page_amount : 1;
      if (page >= pageAmount || body.queue.length === 0) return items;
    }
    return items;
  }

  return {
    async addQueueItem(request) {
      const body = await send("POST", "/queue/AddItem", request);
      const queueItemId = queueItemIdFromAddItemResponse(body);
      if (queueItemId === null) throw new SimplyPrintUnreadableResponseError("POST", "/queue/AddItem", body, "no `created_id` or `id`");
      return { queueItemId };
    },
    async setQueueItemNote(queueItemId, note) {
      await send("POST", `/queue/UpdateItem?job=${queueItemId}`, { note: note.slice(0, SIMPLYPRINT_NOTE_MAX_LENGTH) });
    },
    async listQueueItems() {
      const byId = new Map<number, SimplyPrintListedQueueItem>();
      for (const slice of SIMPLYPRINT_QUEUE_SLICES) for (const item of await listSlice(slice)) byId.set(item.id, { slice, item });
      return [...byId.values()];
    },
    async deleteQueueItem(queueItemId) {
      await send("GET", `/queue/DeleteItem?job=${queueItemId}`);
    },
  };
}
