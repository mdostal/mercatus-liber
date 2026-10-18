/**
 * Real QuickBooks Online OAuth2 token endpoint, confirmed via this package's
 * own quickbooks-types.ts top doc comment (Research finding 1):
 * `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`. Exported (not
 * hardcoded inline in refreshAccessToken) so a caller/test can override it
 * the same way adapter-printful's `baseUrl` config field is overridable.
 */
export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/**
 * Real QuickBooks Online OAuth2 authorization endpoint (same research
 * finding) -- not called by this adapter at runtime (the authorization-code
 * grant's browser-redirect consent step is a one-time, human, out-of-band
 * action performed in the Intuit developer/app dashboard, same as every
 * other OAuth2 provider's "connect your account" step in this repo), but
 * exported so a host application building its own "Connect QuickBooks"
 * admin page has the real, confirmed URL to redirect to rather than
 * guessing at it.
 */
export const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";

export class QuickBooksOAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`QuickBooks OAuth2 token refresh failed: HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "QuickBooksOAuthError";
  }
}

/**
 * A full OAuth2 token set -- deliberately carries BOTH tokens, not just the
 * access token, because every real QuickBooks OAuth2 refresh call returns a
 * brand-new `refresh_token` that must be stored and used for the NEXT
 * refresh (quickbooks-types.ts's Research finding 1: this is the one fact
 * every source consulted agrees on, even where they disagree on the exact
 * expiry duration). A caller that discards the new refresh_token and keeps
 * reusing the original one will eventually have refreshing fail for real,
 * against a live account.
 */
export interface QuickBooksOAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, as returned by the token endpoint's real `expires_in` field. */
  expiresInSeconds: number;
}

/**
 * Real `grant_type=refresh_token` exchange against QuickBooks Online's
 * confirmed token endpoint -- `application/x-www-form-urlencoded` body with
 * HTTP Basic auth (`clientId:clientSecret`), the standard OAuth2 refresh
 * shape every Intuit-published sample and SDK uses (confirmed consistently
 * across the sources quickbooks-types.ts's top doc comment names; this is
 * not QBO-specific beyond the real endpoint URL and the real body field
 * name `refresh_token`).
 */
export async function refreshQuickBooksAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<QuickBooksOAuthTokenSet> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const tokenUrl = config.tokenUrl ?? QUICKBOOKS_TOKEN_URL;

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    }).toString(),
  });

  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    [key: string]: unknown;
  };

  if (!response.ok || !json.access_token || !json.refresh_token) {
    throw new QuickBooksOAuthError(response.status, json);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in ?? 3600,
  };
}
