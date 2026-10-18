import { refreshQuickBooksAccessToken, QUICKBOOKS_TOKEN_URL } from "./oauth.js";
import type {
  QuickBooksCreateSalesEntityRequest,
  QuickBooksEnvelope,
  QuickBooksRecordType,
  QuickBooksSalesEntityResponse,
} from "./quickbooks-types.js";

/**
 * Real QBO v3 Accounting API base URLs, confirmed in quickbooks-types.ts's
 * top doc comment (Research finding 2).
 */
const PRODUCTION_BASE_URL = "https://quickbooks.api.intuit.com";
const SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";

/** The real, confirmed-current `minorversion` as of the one dated source consulted (August 2025) -- configurable, not a silent hardcoded assumption (see quickbooks-types.ts). */
const DEFAULT_MINOR_VERSION = 75;

export class QuickBooksApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`QuickBooks API error: ${method} ${path} -> HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "QuickBooksApiError";
  }
}

export interface QuickBooksHttpClientConfig {
  /** QBO's own per-company id, returned alongside the real OAuth2 authorization-code callback (quickbooks-types.ts's Research finding 2). */
  realmId: string;
  /** Picks the real base URL (production vs. sandbox) -- defaults to "production". */
  environment?: "production" | "sandbox";
  baseUrl?: string;
  minorVersion?: number;
  fetchImpl?: typeof fetch;
  /**
   * A short-lived access token supplied directly -- the caller is
   * responsible for keeping it fresh. Mutually usable alongside `oauth`
   * below: when both are supplied, this is used first and `oauth` is only
   * consulted once a request actually 401s (cheaper than refreshing on
   * every client construction when the caller already has a live token).
   */
  accessToken?: string;
  /**
   * Full OAuth2 refresh credentials -- when `accessToken` is absent, or a
   * request 401s, this client refreshes a new access token via the real
   * `grant_type=refresh_token` exchange (oauth.ts) before retrying exactly
   * once. The refreshed access token (and the new refresh token QuickBooks'
   * real token endpoint always returns alongside it, see oauth.ts's
   * `QuickBooksOAuthTokenSet` doc comment) are cached in-memory on this
   * client instance only -- a real deployment persisting the rotated
   * refresh token across restarts is the caller's own job (this reference
   * client has nowhere durable to put it), surfaced via `onTokenRefreshed`.
   */
  oauth?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    tokenUrl?: string;
  };
  /** Called with the fresh token set every time this client refreshes one -- the caller's hook to persist the rotated refresh_token somewhere durable. */
  onTokenRefreshed?(tokens: { accessToken: string; refreshToken: string }): void;
}

/** The subset of QBO's real v3 Accounting API this adapter actually calls. */
export interface QuickBooksHttpClient {
  /** `POST /v3/company/{realmId}/salesreceipt` or `.../invoice` -- confirmed shared request/response shape (quickbooks-types.ts's Research finding 3). */
  createSalesEntity(
    recordType: QuickBooksRecordType,
    body: QuickBooksCreateSalesEntityRequest,
  ): Promise<QuickBooksSalesEntityResponse>;
}

function entityPath(recordType: QuickBooksRecordType): string {
  // QBO's own real path segments are lowercase, confirmed consistently
  // across every source: "salesreceipt", "invoice" -- not "SalesReceipt".
  return recordType === "SalesReceipt" ? "salesreceipt" : "invoice";
}

export function createQuickBooksHttpClient(config: QuickBooksHttpClientConfig): QuickBooksHttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? (config.environment === "sandbox" ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL);
  const minorVersion = config.minorVersion ?? DEFAULT_MINOR_VERSION;

  let accessToken = config.accessToken;
  let refreshToken = config.oauth?.refreshToken;

  async function refresh(): Promise<void> {
    if (!config.oauth) {
      throw new Error("QuickBooks client has no access token and no oauth refresh credentials configured -- cannot authenticate.");
    }
    const tokens = await refreshQuickBooksAccessToken({
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
      refreshToken: refreshToken ?? config.oauth.refreshToken,
      tokenUrl: config.oauth.tokenUrl ?? QUICKBOOKS_TOKEN_URL,
      fetchImpl,
    });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    config.onTokenRefreshed?.({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  }

  async function request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
    if (!accessToken) await refresh();

    const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}minorversion=${minorVersion}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401 && config.oauth && !isRetry) {
      await refresh();
      return request<T>(method, path, body, true);
    }

    const json = (await response.json()) as unknown;
    if (!response.ok) {
      throw new QuickBooksApiError(method, path, response.status, json);
    }
    return json as T;
  }

  return {
    async createSalesEntity(
      recordType: QuickBooksRecordType,
      body: QuickBooksCreateSalesEntityRequest,
    ): Promise<QuickBooksSalesEntityResponse> {
      const path = `/v3/company/${config.realmId}/${entityPath(recordType)}`;
      const envelope = await request<QuickBooksEnvelope<QuickBooksSalesEntityResponse>>("POST", path, body);
      const entity = envelope[recordType];
      if (!entity) {
        // Disclosed inference, not a silent wrong read -- see
        // quickbooks-types.ts's Research finding 3 doc comment on why the
        // exact envelope key is inferred rather than source-confirmed
        // verbatim. A real response that doesn't carry this key surfaces as
        // a clear, honest parse error instead of returning `undefined` or a
        // fabricated id.
        throw new Error(
          `QuickBooks ${recordType} create response did not carry a "${recordType}" key -- unexpected envelope shape: ${JSON.stringify(envelope)}`,
        );
      }
      return entity;
    },
  };
}
