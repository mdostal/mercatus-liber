import type {
  ShipStationCalculateRatesRequest,
  ShipStationCalculateRatesResponse,
  ShipStationCarrier,
  ShipStationCreateLabelFromRateRequest,
  ShipStationError,
  ShipStationErrorResponse,
  ShipStationLabel,
  ShipStationListCarriersResponse,
  ShipStationTrackingInformation,
  ShipStationVoidLabelResponse,
} from "./shipstation-types.js";

/** The spec's only `servers` entry ("Production"). See shipstation-types.ts. */
export const SHIPSTATION_DEFAULT_BASE_URL = "https://api.shipstation.com";

/**
 * Injectable HTTP client for the slice of ShipStation API v2 this adapter
 * calls. Defaults to global fetch; tests inject a fake. Raw fetch with no
 * client library, same convention as adapter-shippo.
 */
export interface ShipStationHttpClientConfig {
  apiKey: string;
  /** Defaults to https://api.shipstation.com. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function isErrorResponse(body: unknown): body is ShipStationErrorResponse {
  return typeof body === "object" && body !== null && Array.isArray((body as ShipStationErrorResponse).errors);
}

/**
 * A non-2xx response. The message carries method, path, status, ShipStation's
 * `request_id` and its error messages, never the API key (which only ever
 * travels in the request header and is never part of the path or body).
 */
export class ShipStationApiError extends Error {
  readonly errors: ShipStationError[];
  readonly requestId: string | null;

  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    const errors = isErrorResponse(body) ? (body.errors ?? []) : [];
    const requestId = isErrorResponse(body) ? (body.request_id ?? null) : null;
    const detail = errors.length > 0 ? errors.map((error) => error.message).join("; ") : typeof body === "string" ? body.slice(0, 200) : "";
    super(`ShipStation API error: ${method} ${path} -> HTTP ${status}${requestId ? ` (request_id ${requestId})` : ""}${detail ? `: ${detail}` : ""}`);
    this.name = "ShipStationApiError";
    this.errors = errors;
    this.requestId = requestId;
  }
}

export interface ShipStationHttpClient {
  /** `GET /v2/carriers`, every page, `include_extended_details=false`. */
  listCarriers(): Promise<ShipStationCarrier[]>;
  /** `POST /v2/rates`. */
  calculateRates(body: ShipStationCalculateRatesRequest): Promise<ShipStationCalculateRatesResponse>;
  /** `POST /v2/labels/rates/{rate_id}`. */
  createLabelFromRate(rateId: string, body: ShipStationCreateLabelFromRateRequest): Promise<ShipStationLabel>;
  /** `PUT /v2/labels/{label_id}/void`. */
  voidLabel(labelId: string): Promise<ShipStationVoidLabelResponse>;
  /** `GET /v2/labels/{label_id}/track`. Returns null on HTTP 404 (no such label). */
  getLabelTracking(labelId: string): Promise<ShipStationTrackingInformation | null>;
}

export function createShipStationHttpClient(config: ShipStationHttpClientConfig): ShipStationHttpClient {
  const baseUrl = (config.baseUrl ?? SHIPSTATION_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "API-Key": config.apiKey,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    let parsed: unknown = text;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        // Not JSON (e.g. a gateway error page); keep the raw text for the error message.
      }
    }

    if (!response.ok) {
      throw new ShipStationApiError(method, path, response.status, parsed);
    }
    return parsed as T;
  }

  return {
    async listCarriers(): Promise<ShipStationCarrier[]> {
      const carriers: ShipStationCarrier[] = [];
      let page = 1;
      for (;;) {
        const result = await request<ShipStationListCarriersResponse>("GET", `/v2/carriers?include_extended_details=false&page=${page}`);
        carriers.push(...(result.carriers ?? []));
        if (!result.pages || page >= result.pages) return carriers;
        page += 1;
      }
    },

    calculateRates(body) {
      return request<ShipStationCalculateRatesResponse>("POST", "/v2/rates", body);
    },

    createLabelFromRate(rateId, body) {
      return request<ShipStationLabel>("POST", `/v2/labels/rates/${encodeURIComponent(rateId)}`, body);
    },

    voidLabel(labelId) {
      return request<ShipStationVoidLabelResponse>("PUT", `/v2/labels/${encodeURIComponent(labelId)}/void`);
    },

    async getLabelTracking(labelId) {
      try {
        return await request<ShipStationTrackingInformation>("GET", `/v2/labels/${encodeURIComponent(labelId)}/track`);
      } catch (error) {
        if (error instanceof ShipStationApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}
