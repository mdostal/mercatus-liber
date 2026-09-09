import type { PrintfulCreateOrderRequest, PrintfulEnvelope, PrintfulOrderResponse, PrintfulShipmentResponse } from "./printful-types.js";

/**
 * Injectable HTTP client against Printful's real v2 API. Defaults to global
 * fetch; tests inject a recording fake -- same disclosed-double pattern as
 * adapter-shopify's graphql-client.ts (no live Printful account/token exists in
 * this environment, see design-discussion.md's "Real credential gate"). No new
 * HTTP dependency introduced: this repo's other third-party adapters (Shopify)
 * use raw fetch, not a client library, so this one follows the same convention.
 */
export interface PrintfulHttpClientConfig {
  apiToken: string;
  /** Required only for an account-level (not store-level) API token -- confirmed via `X-PF-Store-Id` header on every OrdersV2Service/WebhookV2Service method in the real generated client. */
  storeId?: string;
  /** Defaults to Printful's real v2 base -- confirmed via every endpoint path in OrdersV2Service (e.g. `POST /v2/orders`). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PrintfulApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Printful API error: ${method} ${path} -> HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "PrintfulApiError";
  }
}

/** The subset of Printful's real v2 Orders/Shipments API this adapter actually calls. */
export interface PrintfulHttpClient {
  createOrder(body: PrintfulCreateOrderRequest): Promise<PrintfulEnvelope<PrintfulOrderResponse>>;
  /** `POST /v2/orders/{order_id}/confirmation` -- confirmed path (see printful-types.ts's research note; NOT "/confirm"). Moves a draft order to production and charges the merchant's Wallet (addendum's own confirmed billing model). */
  confirmOrder(orderId: number): Promise<PrintfulEnvelope<PrintfulOrderResponse>>;
  /** `GET /v2/orders/{order_id_or_@external_id}` -- confirmed the `@` prefix addresses an order by its `external_id` instead of Printful's own numeric id. Returns `null` on a 404 (order not found), never throws for that case. */
  getOrder(orderIdOrExternalRef: string): Promise<PrintfulEnvelope<PrintfulOrderResponse> | null>;
  /** `GET /v2/orders/{order_id}/shipments` -- returns `[]` on a 404 (no shipments yet), never throws for that case. */
  getShipments(orderIdOrExternalRef: string): Promise<PrintfulEnvelope<PrintfulShipmentResponse[]>>;
}

const DEFAULT_BASE_URL = "https://api.printful.com";

export function createPrintfulHttpClient(config: PrintfulHttpClientConfig): PrintfulHttpClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        ...(config.storeId ? { "X-PF-Store-Id": config.storeId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 404) return null;

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new PrintfulApiError(method, path, response.status, json);
    }
    return json as T;
  }

  return {
    async createOrder(body: PrintfulCreateOrderRequest): Promise<PrintfulEnvelope<PrintfulOrderResponse>> {
      const result = await request<PrintfulEnvelope<PrintfulOrderResponse>>("POST", "/v2/orders", body);
      if (!result) throw new PrintfulApiError("POST", "/v2/orders", 404, null);
      return result;
    },

    async confirmOrder(orderId: number): Promise<PrintfulEnvelope<PrintfulOrderResponse>> {
      const path = `/v2/orders/${orderId}/confirmation`;
      const result = await request<PrintfulEnvelope<PrintfulOrderResponse>>("POST", path);
      if (!result) throw new PrintfulApiError("POST", path, 404, null);
      return result;
    },

    async getOrder(orderIdOrExternalRef: string): Promise<PrintfulEnvelope<PrintfulOrderResponse> | null> {
      return request<PrintfulEnvelope<PrintfulOrderResponse>>("GET", `/v2/orders/${orderIdOrExternalRef}`);
    },

    async getShipments(orderIdOrExternalRef: string): Promise<PrintfulEnvelope<PrintfulShipmentResponse[]>> {
      const result = await request<PrintfulEnvelope<PrintfulShipmentResponse[]>>("GET", `/v2/orders/${orderIdOrExternalRef}/shipments`);
      return result ?? { data: [] };
    },
  };
}
