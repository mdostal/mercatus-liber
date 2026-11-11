import type {
  Slant3dDraftOrderRequest,
  Slant3dFilament,
  Slant3dFile,
  Slant3dFileEstimate,
  Slant3dOrder,
  Slant3dOrderItem,
  Slant3dPlatform,
  Slant3dPresignedUpload,
  Slant3dWebhookDeliveryResult,
} from "./slant3d-types.js";

export const DEFAULT_SLANT3D_BASE_URL = "https://slant3dapi.com/v2/api";

export interface Slant3dHttpClientConfig {
  /** A Slant API key ("sl-..."), sent as a Bearer token. */
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * A failed Slant request. `slantMessage` is Slant's own explanation, read from
 * whichever of its documented error shapes came back: `{ message, error }` or
 * `{ error: { message, statusCode } }`.
 */
export class Slant3dApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly slantMessage: string | null,
    readonly body: unknown,
  ) {
    super(`Slant 3D API error: ${method} ${path} -> HTTP ${status}${slantMessage ? `: ${slantMessage}` : ""}`);
    this.name = "Slant3dApiError";
  }
}

/** What POST /orders returns: the draft plus its priced items and totals. */
export interface Slant3dDraftOrderResult {
  order: Slant3dOrder;
  /** USD as JSON numbers (docs). Not in the spec, so may be absent. */
  totals?: { printingCost?: number; deliveryCost?: number; totalCost?: number };
}

/** The part of Slant's v2 API this package calls. */
export interface Slant3dHttpClient {
  /** POST /orders. Creates a DRAFT with costs. Nothing is charged or made. */
  draftOrder(body: Slant3dDraftOrderRequest): Promise<Slant3dDraftOrderResult>;
  /** POST /orders/{publicOrderId}. Charges the payment method and queues the order for printing. */
  processOrder(publicOrderId: string): Promise<Slant3dOrder>;
  /** GET /orders/{publicOrderId}. null on a 404. */
  getOrder(publicOrderId: string): Promise<Slant3dOrder | null>;
  /** DELETE /orders/{publicOrderId}. Cancels and refunds (docs). */
  cancelOrder(publicOrderId: string): Promise<void>;
  /** GET /filaments. Several values in one filter match as OR; the two filters match as AND. */
  listFilaments(filter?: { profile?: string[]; color?: string[] }): Promise<Slant3dFilament[]>;
  /** POST /files/direct-upload. */
  requestUpload(input: { name: string; platformId: string; ownerId?: string }): Promise<Slant3dPresignedUpload>;
  /** PUT to the presigned URL. Goes to storage, not Slant's API, so it carries no API key. */
  putFile(presignedUrl: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** POST /files/confirm-upload. A file isn't usable until this is called. */
  confirmUpload(filePlaceholder: Slant3dFile): Promise<Slant3dFile>;
  /** POST /files/{publicFileId}/estimate. Without a filament, Slant prices PLA Black. */
  estimateFile(publicFileId: string, options?: { filamentId?: string; quantity?: number }): Promise<Slant3dFileEstimate>;
  /** GET /platforms. Enabled platforms only. */
  listPlatforms(): Promise<Slant3dPlatform[]>;
  /** POST /platforms. An account can have 5 enabled platforms. */
  createPlatform(input: { name: string; url: string; description?: string; webhookURL?: string }): Promise<Slant3dPlatform>;
  /** GET /platforms/{platformId}. null on a 404. */
  getPlatform(platformId: string): Promise<Slant3dPlatform | null>;
  /** PATCH /platforms/{platformId}. A new webhookSecret replaces the old one at once. */
  updatePlatform(platformId: string, patch: { name?: string; description?: string; url?: string; webhookURL?: string; webhookSecret?: string }): Promise<Slant3dPlatform>;
  /** PATCH /platforms/{platformId}/webhook-secret. Slant generates a new secret; the old one stops working at once. */
  rotateWebhookSecret(platformId: string): Promise<Slant3dPlatform>;
  /** POST /platforms/{platformId}/webhook/dummy. Sends a signed test order.shipped to the platform's webhook URL. */
  sendTestWebhook(platformId: string): Promise<Slant3dWebhookDeliveryResult>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function slantMessageOf(body: unknown): string | null {
  if (typeof body === "string") return body.trim() ? body.trim().slice(0, 500) : null;
  if (!isObject(body)) return null;
  const parts: string[] = [];
  if (typeof body.message === "string" && body.message) parts.push(body.message);
  const error = body.error;
  if (typeof error === "string" && error && !parts.includes(error)) parts.push(error);
  if (isObject(error) && typeof error.message === "string" && error.message) parts.push(error.message);
  return parts.length > 0 ? parts.join(" -- ") : null;
}

/**
 * The docs say a draft wraps its order as `data.order` with `items` beside it,
 * and that process and get return the order directly as `data`. The spec shows
 * `data.order` for all three. This reads either.
 */
function normalizeOrder(path: string, method: string, data: unknown): Slant3dOrder {
  const order = isObject(data) && isObject(data.order) ? data.order : data;
  if (!isObject(order) || typeof order.publicId !== "string") throw new Slant3dApiError(method, path, 200, "the response has no order with a publicId", data);
  const items = Array.isArray(order.items) ? order.items : isObject(data) && Array.isArray(data.items) ? data.items : [];
  return { ...(order as unknown as Slant3dOrder), items: items as Slant3dOrderItem[] };
}

export function createSlant3dHttpClient(config: Slant3dHttpClientConfig): Slant3dHttpClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_SLANT3D_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  /** Returns the envelope's `data`, or null on a 404 when `nullOn404` is set. */
  async function request(method: string, path: string, body?: unknown, nullOn404 = false): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && nullOn404) return null;

    const text = await response.text();
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (a proxy error page, say). Keep the text as the body.
    }
    // The envelope's `success` is "whether the request was successful" (spec), so a 2xx carrying success: false is still a failure.
    if (!response.ok || (isObject(json) && json.success === false)) throw new Slant3dApiError(method, path, response.status, slantMessageOf(json), json);
    return isObject(json) ? json.data : undefined;
  }

  const id = encodeURIComponent;

  return {
    async draftOrder(body) {
      const data = await request("POST", "/orders", body);
      const totals = isObject(data) && isObject(data.totals) ? (data.totals as NonNullable<Slant3dDraftOrderResult["totals"]>) : undefined;
      return { order: normalizeOrder("/orders", "POST", data), ...(totals ? { totals } : {}) };
    },
    async processOrder(publicOrderId) {
      const path = `/orders/${id(publicOrderId)}`;
      return normalizeOrder(path, "POST", await request("POST", path));
    },
    async getOrder(publicOrderId) {
      const path = `/orders/${id(publicOrderId)}`;
      const data = await request("GET", path, undefined, true);
      return data === null ? null : normalizeOrder(path, "GET", data);
    },
    async cancelOrder(publicOrderId) {
      await request("DELETE", `/orders/${id(publicOrderId)}`);
    },
    async listFilaments(filter = {}) {
      const query = new URLSearchParams();
      if (filter.profile?.length) query.set("profile", filter.profile.join(","));
      if (filter.color?.length) query.set("color", filter.color.join(","));
      const data = await request("GET", `/filaments${query.size > 0 ? `?${query.toString()}` : ""}`);
      return Array.isArray(data) ? (data as Slant3dFilament[]) : [];
    },
    async requestUpload(input) {
      return (await request("POST", "/files/direct-upload", input)) as Slant3dPresignedUpload;
    },
    async putFile(presignedUrl, bytes, contentType) {
      const response = await fetchImpl(presignedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
      if (!response.ok) throw new Slant3dApiError("PUT", "(presigned upload URL)", response.status, slantMessageOf(await response.text().catch(() => "")), null);
    },
    async confirmUpload(filePlaceholder) {
      return (await request("POST", "/files/confirm-upload", { filePlaceholder })) as Slant3dFile;
    },
    async estimateFile(publicFileId, options) {
      const body = options && (options.filamentId !== undefined || options.quantity !== undefined) ? { options } : undefined;
      return (await request("POST", `/files/${id(publicFileId)}/estimate`, body)) as Slant3dFileEstimate;
    },
    async listPlatforms() {
      const data = await request("GET", "/platforms");
      return Array.isArray(data) ? (data as Slant3dPlatform[]) : [];
    },
    async createPlatform(input) {
      return (await request("POST", "/platforms", input)) as Slant3dPlatform;
    },
    async getPlatform(platformId) {
      return (await request("GET", `/platforms/${id(platformId)}`, undefined, true)) as Slant3dPlatform | null;
    },
    async updatePlatform(platformId, patch) {
      return (await request("PATCH", `/platforms/${id(platformId)}`, patch)) as Slant3dPlatform;
    },
    async rotateWebhookSecret(platformId) {
      return (await request("PATCH", `/platforms/${id(platformId)}/webhook-secret`)) as Slant3dPlatform;
    },
    async sendTestWebhook(platformId) {
      return (await request("POST", `/platforms/${id(platformId)}/webhook/dummy`)) as Slant3dWebhookDeliveryResult;
    },
  };
}
