import { createSign } from "node:crypto";
import type { AnalyticsInsightsAdapter, AnalyticsInsightsRange, PageViewRow, TopReferrerRow, TrafficSourceRow } from "./types.js";

const PROVIDER = "ga4";

/**
 * Real, current (v1beta) Google Analytics Data API endpoints -- see
 * developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 * (report endpoint) and developers.google.com/identity/protocols/oauth2/service-account
 * (service-account token exchange). Confirmed directly against Google's live
 * docs during implementation, not assumed -- see this story's commit message
 * for what was checked.
 */
const RUN_REPORT_HOST = "https://analyticsdata.googleapis.com";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** A signed JWT's lifetime has a hard 1-hour ceiling per Google's docs; refresh a little early. */
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_SKEW_SECONDS = 60;

export interface Ga4InsightsAdapterConfig {
  /**
   * Numeric GA4 property ID (Admin -> Property Settings -> Property ID),
   * *without* the "properties/" prefix -- this adapter builds the full
   * `properties/{propertyId}` resource path itself, matching the real
   * runReport request URL shape
   * (`POST https://analyticsdata.googleapis.com/v1beta/{property=properties/*}:runReport`).
   */
  propertyId: string;
  /**
   * A real GA4 read path requires a Google Cloud **service account** with
   * "Viewer" access granted on the GA4 property itself (Admin -> Property
   * Access Management), not just a Cloud IAM role -- these two fields are
   * `client_email`/`private_key` straight out of that service account's JSON
   * key file. This is the real credential gate this adapter's live path
   * depends on: see this story's final report for whether a real credential
   * was available in this environment.
   */
  serviceAccountEmail: string;
  /** PEM-encoded RSA private key, e.g. the `private_key` field of the service-account JSON key file (including the `-----BEGIN PRIVATE KEY-----` header). */
  privateKey: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to `() => Date.now()`. Drives the JWT's `iat`/`exp` claims and the cached-token refresh check. */
  now?: () => number;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface RunReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/**
 * Builds and signs the self-signed JWT assertion Google's OAuth2 service-
 * account flow requires (RS256, per developers.google.com/identity/protocols/oauth2/service-account
 * "Using JWT with a service account"). `aud` is always the token endpoint
 * itself, `scope` is the single read-only Analytics Data API scope this
 * adapter needs, `exp` is capped at the documented 1-hour maximum after
 * `iat`.
 */
function signJwtAssertion(config: { serviceAccountEmail: string; privateKey: string }, nowSeconds: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: config.serviceAccountEmail,
    scope: READONLY_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };

  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(claimSet)))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(config.privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Real GA4 Data API (v1beta) insights adapter -- authenticates as a service
 * account (self-signed JWT -> `urn:ietf:params:oauth:grant-type:jwt-bearer`
 * token exchange, per Google's real, current docs) and wraps three real
 * `runReport` calls against the documented request/response shape
 * (`dimensions`/`metrics`/`dateRanges` in, `dimensionHeaders`/`metricHeaders`/
 * `rows` with string-valued `dimensionValues`/`metricValues` out -- GA4
 * always returns metric values as strings, even for numeric metrics).
 *
 * This adapter's live path against a real GA4 property is a real credential
 * gate (a real property ID + service-account key) -- see this story's final
 * report for whether a real credential was genuinely available in this
 * environment for live verification, mirroring epic 27's admin-auth-clerk
 * disclosure precedent (packages/adapter-clerk/src/index.ts).
 */
export function createGa4InsightsAdapter(config: Ga4InsightsAdapterConfig): AnalyticsInsightsAdapter {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? (() => Date.now());

  let cachedToken: { accessToken: string; expiresAtSeconds: number } | null = null;

  async function getAccessToken(): Promise<string> {
    const nowSeconds = Math.floor(now() / 1000);
    if (cachedToken && cachedToken.expiresAtSeconds - TOKEN_REFRESH_SKEW_SECONDS > nowSeconds) {
      return cachedToken.accessToken;
    }

    const assertion = signJwtAssertion(config, nowSeconds);
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GA4 service-account token exchange failed (${response.status}): ${body}`);
    }

    const token = (await response.json()) as GoogleTokenResponse;
    cachedToken = { accessToken: token.access_token, expiresAtSeconds: nowSeconds + token.expires_in };
    return token.access_token;
  }

  async function runReport(dimensionNames: string[], metricName: string, range: AnalyticsInsightsRange): Promise<RunReportResponse> {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(`${RUN_REPORT_HOST}/v1beta/properties/${config.propertyId}:runReport`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: toGa4Date(range.from), endDate: toGa4Date(range.to) }],
        dimensions: dimensionNames.map((name) => ({ name })),
        metrics: [{ name: metricName }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GA4 Data API runReport request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as RunReportResponse;
  }

  return {
    async getTrafficSources(range: AnalyticsInsightsRange): Promise<TrafficSourceRow[]> {
      const { rows } = await runReport(["sessionSource"], "sessions", range);
      return (rows ?? []).map((row) => ({
        provider: PROVIDER,
        source: dimensionValue(row, 0),
        sessions: Number(metricValue(row, 0)),
      }));
    },

    async getPageViews(range: AnalyticsInsightsRange): Promise<PageViewRow[]> {
      const { rows } = await runReport(["pagePath"], "screenPageViews", range);
      return (rows ?? []).map((row) => ({
        provider: PROVIDER,
        path: dimensionValue(row, 0),
        views: Number(metricValue(row, 0)),
      }));
    },

    async getTopReferrers(range: AnalyticsInsightsRange): Promise<TopReferrerRow[]> {
      // GA4 has no single "referrer URL" dimension analogous to PostHog's
      // $referrer; the documented, real equivalent is the sessionSource/
      // sessionMedium pair (per this story's own spec) -- combined here into
      // a single "source / medium" label for TopReferrerRow's `referrer`
      // field.
      const { rows } = await runReport(["sessionSource", "sessionMedium"], "sessions", range);
      return (rows ?? []).map((row) => ({
        provider: PROVIDER,
        referrer: `${dimensionValue(row, 0)} / ${dimensionValue(row, 1)}`,
        count: Number(metricValue(row, 0)),
      }));
    },
  };
}

/**
 * GA4 always returns exactly as many `dimensionValues`/`metricValues` per row
 * as were requested in `dimensions`/`metrics` -- these two accessors assert
 * that documented invariant explicitly (rather than a silent `?. ?? ""`
 * fallback) so a genuinely malformed response fails loudly instead of
 * mapping to a misleading blank row.
 */
function dimensionValue(row: NonNullable<RunReportResponse["rows"]>[number], index: number): string {
  const entry = row.dimensionValues[index];
  if (!entry) throw new Error(`GA4 runReport row missing dimensionValues[${index}]`);
  return entry.value;
}

function metricValue(row: NonNullable<RunReportResponse["rows"]>[number], index: number): string {
  const entry = row.metricValues[index];
  if (!entry) throw new Error(`GA4 runReport row missing metricValues[${index}]`);
  return entry.value;
}

/**
 * GA4's runReport `dateRanges[].startDate`/`endDate` are plain `YYYY-MM-DD`
 * calendar dates (not datetimes) per Google's documented format -- this
 * adapter's `AnalyticsInsightsRange` is ISO 8601 date/datetime per the
 * shared contract, so a datetime input is truncated to its date portion.
 */
function toGa4Date(isoDateOrDatetime: string): string {
  return isoDateOrDatetime.slice(0, 10);
}
