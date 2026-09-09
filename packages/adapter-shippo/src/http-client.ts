import type {
  ShippoCreateShipmentRequest,
  ShippoCreateTransactionRequest,
  ShippoShipmentResponse,
  ShippoTrackingResponse,
  ShippoTransactionResponse,
} from "./shippo-types.js";

/** Shippo's real, confirmed API base URL -- see shippo-types.ts's top comment. */
const DEFAULT_BASE_URL = "https://api.goshippo.com";

/**
 * Injectable HTTP client against Shippo's real, confirmed REST API. Defaults
 * to global fetch; tests inject a recording fake -- same disclosed-double
 * pattern as adapter-printful/adapter-printify's own http-client.ts (no live
 * Shippo account/token exists in this environment, see
 * design-discussion.md's "Real credential gate"). No new HTTP dependency
 * introduced: this repo's other third-party adapters use raw fetch, not a
 * client library, so this one follows the same convention.
 */
export interface ShippoHttpClientConfig {
  apiToken: string;
  /** Defaults to Shippo's real, confirmed base (shippo-types.ts's top comment). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ShippoApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Shippo API error: ${method} ${path} -> HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "ShippoApiError";
  }
}

/** The subset of Shippo's real, confirmed API this adapter actually calls. */
export interface ShippoHttpClient {
  /** `POST /shipments/` -- confirmed path/body shape (shippo-types.ts). Creates a Shipment and (with `async: false`) synchronously returns it with its real quoted `rates`. */
  createShipment(body: ShippoCreateShipmentRequest): Promise<ShippoShipmentResponse>;
  /** `POST /transactions/` -- confirmed path/body shape (shippo-types.ts). Purchases the label for a previously-quoted rate. */
  createTransaction(body: ShippoCreateTransactionRequest): Promise<ShippoTransactionResponse>;
  /** `GET /tracks/{carrier}/{tracking_number}` -- confirmed path (shippo-types.ts). Returns `null` on a 404 (unrecognized tracking number), never throws for that case. */
  getTrackingStatus(carrier: string, trackingNumber: string): Promise<ShippoTrackingResponse | null>;
}

export function createShippoHttpClient(config: ShippoHttpClientConfig): ShippoHttpClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Confirmed real scheme (shippo-types.ts's top comment): "ShippoToken <token>", NOT Bearer.
        Authorization: `ShippoToken ${config.apiToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 404) return null;

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new ShippoApiError(method, path, response.status, json);
    }
    return json as T;
  }

  return {
    async createShipment(body: ShippoCreateShipmentRequest): Promise<ShippoShipmentResponse> {
      const path = "/shipments/";
      const result = await request<ShippoShipmentResponse>("POST", path, body);
      if (!result) throw new ShippoApiError("POST", path, 404, null);
      return result;
    },

    async createTransaction(body: ShippoCreateTransactionRequest): Promise<ShippoTransactionResponse> {
      const path = "/transactions/";
      const result = await request<ShippoTransactionResponse>("POST", path, body);
      if (!result) throw new ShippoApiError("POST", path, 404, null);
      return result;
    },

    async getTrackingStatus(carrier: string, trackingNumber: string): Promise<ShippoTrackingResponse | null> {
      return request<ShippoTrackingResponse>("GET", `/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`);
    },
  };
}
