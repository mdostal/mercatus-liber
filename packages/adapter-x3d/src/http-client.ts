import type { X3dCreateOrderFields, X3dCreateOrderResponse, X3dModelSource, X3dOrder, X3dPriceRequest, X3dPriceResponse } from "./x3d-types.js";

export const DEFAULT_X3D_BASE_URL = "https://x3dstudios.com";

export interface X3dHttpClientConfig {
  /** An X3D API key ("x3d_live_..."), sent as a Bearer token. Orders bill the card on file for the key's account. */
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** X3D answered with an error status. `x3dMessage` is the `error` string from its body. */
export class X3dApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly x3dMessage: string | null,
    readonly code: string | null,
    readonly body: unknown,
  ) {
    super(`X3D Studios API error: ${method} ${path} -> HTTP ${status}${x3dMessage ? `: ${x3dMessage}` : ""}`);
    this.name = "X3dApiError";
  }
}

/** The part of X3D's Print API this package calls. No call here retries. */
export interface X3dHttpClient {
  /**
   * POST /api/print/orders. X3D slices the model, charges the card on file and
   * queues the print. There is no draft, no sandbox and no idempotency key:
   * sending the same order twice makes and charges two.
   */
  createOrder(fields: X3dCreateOrderFields, model: X3dModelSource): Promise<X3dCreateOrderResponse>;
  /** GET /api/print/orders/{code}. null on a 404, which X3D also returns for another account's order. */
  getOrder(code: string): Promise<X3dOrder | null>;
  /** POST /api/price. One colour, priced from a bounding box. Needs no key. */
  price(request: X3dPriceRequest): Promise<X3dPriceResponse>;
}

export function createX3dHttpClient(config: X3dHttpClientConfig): X3dHttpClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_X3D_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;
  const auth = { Authorization: `Bearer ${config.apiKey}` };

  async function send<T>(method: string, path: string, init: RequestInit, options: { nullOn404?: boolean } = {}): Promise<T | null> {
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, method });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (response.ok) return body as T;
    if (response.status === 404 && options.nullOn404) return null;
    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    throw new X3dApiError(method, path, response.status, typeof record.error === "string" ? record.error : null, typeof record.code === "string" ? record.code : null, body);
  }

  return {
    async createOrder(fields, model) {
      const form = new FormData();
      if ("modelUrl" in model) form.set("modelUrl", model.modelUrl);
      else form.set("file", model.file, model.fileName);
      const { emails, ...rest } = fields;
      for (const [key, value] of Object.entries(rest)) if (value !== undefined && value !== "") form.set(key, String(value));
      for (const email of emails ?? []) form.append("email", email);
      // No Content-Type header: fetch sets the multipart boundary itself.
      return (await send<X3dCreateOrderResponse>("POST", "/api/print/orders", { headers: auth, body: form }))!;
    },
    async getOrder(code) {
      return send<X3dOrder>("GET", `/api/print/orders/${encodeURIComponent(code)}`, { headers: auth }, { nullOn404: true });
    },
    async price(request) {
      return (await send<X3dPriceResponse>("POST", "/api/price", { headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }))!;
    },
  };
}
