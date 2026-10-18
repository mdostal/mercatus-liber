import type {
  PaypalCreateOrderRequest,
  PaypalOauthTokenResponse,
  PaypalOrderResponse,
  PaypalVerifyWebhookSignatureRequest,
  PaypalVerifyWebhookSignatureResponse,
} from "./paypal-types.js";

/**
 * Injectable HTTP client against PayPal's real, documented REST API. Defaults
 * to global fetch; tests inject a recording fake -- same disclosed-double
 * pattern as adapter-printful/adapter-printify/adapter-shippo's own
 * http-client.ts (no live PayPal account/app exists in this environment, see
 * design-discussion.md's "Real credential gate"). No new HTTP dependency
 * introduced: this repo's other third-party adapters use raw fetch, not a
 * client library, so this one follows the same convention.
 *
 * `baseUrl` defaults to PayPal's real sandbox base
 * (developer.paypal.com/api/rest/authentication/'s own example host,
 * `api-m.sandbox.paypal.com`) -- a caller passes the live base
 * (`https://api-m.paypal.com`) explicitly to go live, the same
 * "sandbox-by-default, explicit opt-in to live" posture most of this repo's
 * other credential-gated adapters leave to the operator rather than guessing
 * which the operator wants.
 */
export interface PaypalHttpClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PaypalApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`PayPal API error: ${method} ${path} -> HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "PaypalApiError";
  }
}

/** The subset of PayPal's real, documented REST API this adapter actually calls. */
export interface PaypalHttpClient {
  /** `POST /v2/checkout/orders` -- confirmed request/response shape (paypal-types.ts research finding 2). Creates an order in `CREATED` status, uncharged until captured. */
  createOrder(body: PaypalCreateOrderRequest): Promise<PaypalOrderResponse>;
  /** `POST /v2/checkout/orders/{id}/capture` -- confirmed path and response shape. Captures an `APPROVED` order, moving it to `COMPLETED`. */
  captureOrder(orderId: string): Promise<PaypalOrderResponse>;
  /** `GET /v2/checkout/orders/{id}` -- confirmed path. Returns `null` on a real 404 (order not found), never throws for that case, mirroring adapter-printful/adapter-printify's own `getOrder`. */
  getOrder(orderId: string): Promise<PaypalOrderResponse | null>;
  /** `POST /v1/notifications/verify-webhook-signature` -- confirmed request/response shape (paypal-types.ts research findings; see webhook.ts for why this adapter uses PayPal's own remote verification call rather than the alternative local CRC32+RSA self-verification scheme PayPal also documents). */
  verifyWebhookSignature(body: PaypalVerifyWebhookSignatureRequest): Promise<PaypalVerifyWebhookSignatureResponse>;
}

const DEFAULT_BASE_URL = "https://api-m.sandbox.paypal.com";

export function createPaypalHttpClient(config: PaypalHttpClientConfig): PaypalHttpClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  // Cached in-memory, per http-client instance -- confirmed real expiry
  // (`expires_in`, seconds) from developer.paypal.com/api/rest/authentication/'s
  // own documented token response; refetched once expired rather than on
  // every single call, the same "don't re-authenticate every request when
  // the provider hands you an expiry" posture any OAuth2 client-credentials
  // integration follows. 60s of early-expiry slack avoids a request landing
  // right at the boundary with a token PayPal has already invalidated.
  let cachedToken: { accessToken: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }

    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf-8").toString("base64");
    const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new PaypalApiError("POST", "/v1/oauth2/token", response.status, json);
    }

    const token = json as PaypalOauthTokenResponse;
    cachedToken = { accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
    return token.access_token;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 404) return null;

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new PaypalApiError(method, path, response.status, json);
    }
    return json as T;
  }

  return {
    async createOrder(body: PaypalCreateOrderRequest): Promise<PaypalOrderResponse> {
      const result = await request<PaypalOrderResponse>("POST", "/v2/checkout/orders", body);
      if (!result) throw new PaypalApiError("POST", "/v2/checkout/orders", 404, null);
      return result;
    },

    async captureOrder(orderId: string): Promise<PaypalOrderResponse> {
      const path = `/v2/checkout/orders/${orderId}/capture`;
      const result = await request<PaypalOrderResponse>("POST", path);
      if (!result) throw new PaypalApiError("POST", path, 404, null);
      return result;
    },

    async getOrder(orderId: string): Promise<PaypalOrderResponse | null> {
      return request<PaypalOrderResponse>("GET", `/v2/checkout/orders/${orderId}`);
    },

    async verifyWebhookSignature(body: PaypalVerifyWebhookSignatureRequest): Promise<PaypalVerifyWebhookSignatureResponse> {
      const path = "/v1/notifications/verify-webhook-signature";
      const result = await request<PaypalVerifyWebhookSignatureResponse>("POST", path, body);
      if (!result) throw new PaypalApiError("POST", path, 404, null);
      return result;
    },
  };
}
