import type { PrintifyCreateWebhookRequest, PrintifyOrderResponse, PrintifySendToProductionResponse, PrintifySubmitOrderRequest, PrintifySubmitOrderResponse } from "./printify-types.js";

/**
 * The default, app-identifying `User-Agent` value every request from this
 * adapter carries. Printify's real, current docs require this on every
 * request ("All requests must also specify a User-Agent header. The value of
 * this header should either be the type of client ... or the name of your
 * application.") -- quoted verbatim in printify-types.ts's top comment.
 * Overridable via `PrintifyHttpClientConfig.userAgent` for a host application
 * that wants to identify itself instead (e.g. "shop.mdostal.com/1.0"), but
 * always present -- see http-client.test.ts's dedicated header assertion,
 * which is this story's acceptance-criterion-2 proof.
 */
export const DEFAULT_PRINTIFY_USER_AGENT = "mercatus-liber-adapter-printify/0.1.0";

/**
 * Injectable HTTP client against Printify's real, confirmed v1 API. Defaults
 * to global fetch; tests inject a recording fake -- same disclosed-double
 * pattern as adapter-printful's http-client.ts (no live Printify account/
 * token exists in this environment, see design-discussion.md's "Real
 * credential gate"). No new HTTP dependency introduced: this repo's other
 * third-party adapters (Shopify, Printful) use raw fetch, not a client
 * library, so this one follows the same convention.
 */
export interface PrintifyHttpClientConfig {
  apiToken: string;
  /** Real Printify accounts can have multiple shops; every order/webhook endpoint requires one (design-discussion.md §1b) -- taken as required config, no auto-discovery. */
  shopId: string;
  /** Defaults to Printify's real, confirmed v1 base (docs: "Use the appropriate base URL for your brand ... Printify: https://api.printify.com/v1/"). */
  baseUrl?: string;
  /** Defaults to DEFAULT_PRINTIFY_USER_AGENT -- see its own doc comment. */
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export class PrintifyApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Printify API error: ${method} ${path} -> HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "PrintifyApiError";
  }
}

/** The subset of Printify's real, confirmed v1 Orders/Webhooks API this adapter actually calls. */
export interface PrintifyHttpClient {
  /** `POST /v1/shops/{shop_id}/orders.json` -- confirmed path and body shape (printify-types.ts). Creates an order in `pending`/`on-hold` status, UNCHARGED. */
  createOrder(body: PrintifySubmitOrderRequest): Promise<PrintifySubmitOrderResponse>;
  /** `POST /v1/shops/{shop_id}/orders/{order_id}/send_to_production.json` -- confirmed path (community SDK's `sendToProduction.ts`). Moves the order to production and is the real point Printify charges the merchant (design-discussion.md's confirmed billing model). */
  sendToProduction(orderId: string): Promise<PrintifySendToProductionResponse>;
  /** `GET /v1/shops/{shop_id}/orders/{order_id}.json` -- confirmed path (docs' "Retrieve an order" section / community SDK's `getOne.ts`). Returns `null` on a 404 (order not found), never throws for that case. */
  getOrder(orderId: string): Promise<PrintifyOrderResponse | null>;
  /** `POST /v1/shops/{shop_id}/webhooks.json` -- confirmed path/body shape (printify-types.ts). Exposed for completeness (subscription setup is an operator/deploy-time concern, not something `submitOrder`/`getOrderStatus`/`handleWebhookEvent` call themselves), exercised by http-client.test.ts. */
  createWebhook(body: PrintifyCreateWebhookRequest): Promise<{ id: string; topic: string; url: string; shop_id: string }>;
}

const DEFAULT_BASE_URL = "https://api.printify.com";

export function createPrintifyHttpClient(config: PrintifyHttpClientConfig): PrintifyHttpClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const userAgent = config.userAgent ?? DEFAULT_PRINTIFY_USER_AGENT;
  const fetchImpl = config.fetchImpl ?? fetch;
  const shopPath = `/v1/shops/${config.shopId}`;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        // Required on every request, confirmed (printify-types.ts's top comment) -- never omitted.
        "User-Agent": userAgent,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 404) return null;

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new PrintifyApiError(method, path, response.status, json);
    }
    return json as T;
  }

  return {
    async createOrder(body: PrintifySubmitOrderRequest): Promise<PrintifySubmitOrderResponse> {
      const path = `${shopPath}/orders.json`;
      const result = await request<PrintifySubmitOrderResponse>("POST", path, body);
      if (!result) throw new PrintifyApiError("POST", path, 404, null);
      return result;
    },

    async sendToProduction(orderId: string): Promise<PrintifySendToProductionResponse> {
      const path = `${shopPath}/orders/${orderId}/send_to_production.json`;
      const result = await request<PrintifySendToProductionResponse>("POST", path);
      if (!result) throw new PrintifyApiError("POST", path, 404, null);
      return result;
    },

    async getOrder(orderId: string): Promise<PrintifyOrderResponse | null> {
      return request<PrintifyOrderResponse>("GET", `${shopPath}/orders/${orderId}.json`);
    },

    async createWebhook(body: PrintifyCreateWebhookRequest): Promise<{ id: string; topic: string; url: string; shop_id: string }> {
      const path = `${shopPath}/webhooks.json`;
      const result = await request<{ id: string; topic: string; url: string; shop_id: string }>("POST", path, body);
      if (!result) throw new PrintifyApiError("POST", path, 404, null);
      return result;
    },
  };
}
