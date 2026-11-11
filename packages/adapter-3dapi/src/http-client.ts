import { randomUUID } from "node:crypto";
import type { DapiCreateOrderRequest, DapiErrorBody, DapiList, DapiOrder } from "./dapi-types.js";

export const DAPI_DEFAULT_BASE_URL = "https://public-api.dapi.digital";

export interface DapiHttpClientConfig {
  /** An integrator API key, sent in the `x-api-key` header. */
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * A 3DAPI error response. `code` is 3DAPI's stable error code (for example
 * `insufficient_balance` or `quote_not_ready`); branch on it, not on `message`.
 *
 * When the response is not 3DAPI's documented error body (a proxy's HTML page,
 * say), `code` is "unknown". That value is this package's, not 3DAPI's.
 */
export class DapiApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly code: string,
    /** 3DAPI's own message, which says how to fix the problem. */
    readonly apiMessage: string,
    readonly details: unknown,
  ) {
    super(`3DAPI ${method} ${path} failed with HTTP ${status} (${code}): ${apiMessage}`);
    this.name = "DapiApiError";
  }
}

export interface DapiRequestOptions {
  query?: Record<string, string | number | string[] | undefined>;
  body?: unknown;
  /**
   * Sent as `Idempotency-Key` on a POST. 3DAPI returns the first response for
   * the same key and body for 24 hours. Defaults to a random UUID, which makes
   * that one call safe to resend at the network level but does not protect a
   * retry made by calling the method again.
   */
  idempotencyKey?: string;
  /** false sends no API key, for the endpoints 3DAPI documents as public. Defaults to true. */
  auth?: boolean;
}

export interface DapiHttpClient {
  /** One JSON request. Throws DapiApiError on any non-2xx response. */
  request<T>(method: "GET" | "POST", path: string, options?: DapiRequestOptions): Promise<T>;
  /** POST /v2/integrator/orders. */
  createOrder(body: DapiCreateOrderRequest, idempotencyKey: string): Promise<DapiOrder>;
  /** GET /v2/integrator/orders/{id}, with its lines. null when 3DAPI answers 404 `order_not_found`. */
  getOrder(id: string): Promise<DapiOrder | null>;
  /** GET /v2/integrator/orders?reference=..., every page, newest first, with lines. */
  listOrdersByReference(reference: string): Promise<DapiOrder[]>;
  /** POST /v2/integrator/orders/{id}/cancel. 3DAPI refunds a `paid` order in full and refuses one a production partner has started (409 `order_not_cancellable`). */
  cancelOrder(id: string, idempotencyKey?: string): Promise<DapiOrder>;
}

function isErrorBody(value: unknown): value is DapiErrorBody {
  return typeof value === "object" && value !== null && typeof (value as DapiErrorBody).code === "string" && typeof (value as DapiErrorBody).message === "string";
}

export function createDapiHttpClient(config: DapiHttpClientConfig): DapiHttpClient {
  const baseUrl = (config.baseUrl ?? DAPI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: "GET" | "POST", path: string, options: DapiRequestOptions = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      for (const one of Array.isArray(value) ? value : [value]) params.append(key, String(one));
    }
    const queryString = params.toString();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.auth !== false) headers["x-api-key"] = config.apiKey;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (method === "POST") headers["Idempotency-Key"] = options.idempotencyKey ?? randomUUID();

    const response = await fetchImpl(`${baseUrl}${path}${queryString ? `?${queryString}` : ""}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    if (!response.ok) {
      if (isErrorBody(json)) throw new DapiApiError(method, path, response.status, json.code, json.message, json.details ?? null);
      throw new DapiApiError(method, path, response.status, "unknown", text.slice(0, 500) || response.statusText, null);
    }
    if (json === undefined) throw new DapiApiError(method, path, response.status, "unknown", "The response was not JSON.", null);
    return json as T;
  }

  return {
    request,

    createOrder(body, idempotencyKey) {
      return request<DapiOrder>("POST", "/v2/integrator/orders", { body, idempotencyKey });
    },

    async getOrder(id) {
      try {
        return await request<DapiOrder>("GET", `/v2/integrator/orders/${encodeURIComponent(id)}`);
      } catch (err) {
        if (err instanceof DapiApiError && err.status === 404) return null;
        throw err;
      }
    },

    async listOrdersByReference(reference) {
      const orders: DapiOrder[] = [];
      let cursor: string | undefined;
      do {
        const page: DapiList<DapiOrder> = await request<DapiList<DapiOrder>>("GET", "/v2/integrator/orders", {
          query: { reference, "expand[]": ["items"], limit: 100, cursor },
        });
        orders.push(...page.data);
        cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
      } while (cursor);
      return orders;
    },

    cancelOrder(id, idempotencyKey) {
      return request<DapiOrder>("POST", `/v2/integrator/orders/${encodeURIComponent(id)}/cancel`, idempotencyKey !== undefined ? { idempotencyKey } : {});
    },
  };
}
