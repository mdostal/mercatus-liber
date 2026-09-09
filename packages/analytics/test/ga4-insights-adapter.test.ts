import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGa4InsightsAdapter } from "../src/ga4-insights-adapter.js";

/**
 * A real RSA keypair generated once for this test file so the adapter's real
 * RS256 JWT signing (node:crypto's `createSign`) has a real key to sign
 * against, and the assertions below can verify the signature is real and
 * valid rather than just "looks like a JWT".
 */
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function decodeJwt(assertion: string): { header: Record<string, unknown>; claims: Record<string, unknown>; signingInput: string; signature: Buffer } {
  const [headerPart, claimsPart, signaturePart] = assertion.split(".");
  return {
    header: JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")),
    claims: JSON.parse(Buffer.from(claimsPart, "base64url").toString("utf8")),
    signingInput: `${headerPart}.${claimsPart}`,
    signature: Buffer.from(signaturePart, "base64url"),
  };
}

/**
 * Mocked GA4 token-exchange response, shaped like Google's real, documented
 * OAuth2 service-account response (developers.google.com/identity/protocols/oauth2/service-account).
 */
function tokenResponse(accessToken = "ya29.test-access-token", expiresIn = 3600) {
  return jsonResponse({ access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" });
}

describe("createGa4InsightsAdapter", () => {
  const range = { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" };
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  function makeAdapter(nowMs = Date.parse("2026-09-01T12:00:00Z")) {
    return createGa4InsightsAdapter({
      propertyId: "123456789",
      serviceAccountEmail: "ga4-reader@my-project.iam.gserviceaccount.com",
      privateKey: PRIVATE_KEY_PEM,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => nowMs,
    });
  }

  it("exchanges a real, correctly-signed self-signed JWT for an access token at the real token endpoint, before calling runReport", async () => {
    fetchImpl
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          dimensionHeaders: [{ name: "sessionSource" }],
          metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
          rows: [
            { dimensionValues: [{ value: "google" }], metricValues: [{ value: "42" }] },
            { dimensionValues: [{ value: "(direct)" }], metricValues: [{ value: "17" }] },
          ],
        }),
      );

    const adapter = makeAdapter();
    const result = await adapter.getTrafficSources(range);

    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Call 1: real token exchange.
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(tokenInit.method).toBe("POST");
    expect(tokenInit.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });

    const tokenParams = new URLSearchParams(tokenInit.body as string);
    expect(tokenParams.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const assertion = tokenParams.get("assertion");
    expect(assertion).toBeTruthy();

    const { header, claims, signingInput, signature } = decodeJwt(assertion as string);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims.iss).toBe("ga4-reader@my-project.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.exp).toBe((claims.iat as number) + 3600);
    // The signature is real and verifies against the real public key -- not a placeholder string.
    expect(verify("RSA-SHA256", Buffer.from(signingInput), publicKey, signature)).toBe(true);

    // Call 2: the real runReport request, authenticated with the exchanged token.
    const [reportUrl, reportInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(reportUrl).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport");
    expect(reportInit.headers).toMatchObject({
      Authorization: "Bearer ya29.test-access-token",
      "Content-Type": "application/json",
    });
    const reportBody = JSON.parse(reportInit.body as string);
    expect(reportBody.dimensions).toEqual([{ name: "sessionSource" }]);
    expect(reportBody.metrics).toEqual([{ name: "sessions" }]);
    expect(reportBody.dateRanges).toEqual([{ startDate: "2026-08-01", endDate: "2026-09-01" }]);

    expect(result).toEqual([
      { provider: "ga4", source: "google", sessions: 42 },
      { provider: "ga4", source: "(direct)", sessions: 17 },
    ]);
  });

  it("getPageViews requests pagePath/screenPageViews and maps rows with provider attribution", async () => {
    fetchImpl.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        dimensionHeaders: [{ name: "pagePath" }],
        metricHeaders: [{ name: "screenPageViews", type: "TYPE_INTEGER" }],
        rows: [
          { dimensionValues: [{ value: "/" }], metricValues: [{ value: "120" }] },
          { dimensionValues: [{ value: "/products/widget" }], metricValues: [{ value: "55" }] },
        ],
      }),
    );

    const result = await makeAdapter().getPageViews(range);

    const reportBody = JSON.parse((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(reportBody.dimensions).toEqual([{ name: "pagePath" }]);
    expect(reportBody.metrics).toEqual([{ name: "screenPageViews" }]);

    expect(result).toEqual([
      { provider: "ga4", path: "/", views: 120 },
      { provider: "ga4", path: "/products/widget", views: 55 },
    ]);
  });

  it("getTopReferrers requests sessionSource+sessionMedium and combines them into a single referrer label", async () => {
    fetchImpl.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      jsonResponse({
        dimensionHeaders: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
        rows: [
          { dimensionValues: [{ value: "google" }, { value: "organic" }], metricValues: [{ value: "88" }] },
          { dimensionValues: [{ value: "(direct)" }, { value: "(none)" }], metricValues: [{ value: "33" }] },
        ],
      }),
    );

    const result = await makeAdapter().getTopReferrers(range);

    const reportBody = JSON.parse((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(reportBody.dimensions).toEqual([{ name: "sessionSource" }, { name: "sessionMedium" }]);

    expect(result).toEqual([
      { provider: "ga4", referrer: "google / organic", count: 88 },
      { provider: "ga4", referrer: "(direct) / (none)", count: 33 },
    ]);
  });

  it("reuses a cached access token across calls within its lifetime instead of re-exchanging", async () => {
    fetchImpl
      .mockResolvedValueOnce(tokenResponse("ya29.first-token", 3600))
      .mockResolvedValueOnce(jsonResponse({ rows: [] }))
      .mockResolvedValueOnce(jsonResponse({ rows: [] }));

    const adapter = makeAdapter();
    await adapter.getPageViews(range);
    await adapter.getTopReferrers(range);

    // Only one token exchange for two report calls: 1 token + 2 reports = 3 total fetches.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const tokenExchangeCalls = fetchImpl.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token");
    expect(tokenExchangeCalls).toHaveLength(1);
  });

  it("re-exchanges the token once the cached one is past its expiry", async () => {
    let currentTime = Date.parse("2026-09-01T12:00:00Z");
    fetchImpl
      .mockResolvedValueOnce(tokenResponse("ya29.first-token", 3600))
      .mockResolvedValueOnce(jsonResponse({ rows: [] }))
      .mockResolvedValueOnce(tokenResponse("ya29.second-token", 3600))
      .mockResolvedValueOnce(jsonResponse({ rows: [] }));

    const adapter = createGa4InsightsAdapter({
      propertyId: "123456789",
      serviceAccountEmail: "ga4-reader@my-project.iam.gserviceaccount.com",
      privateKey: PRIVATE_KEY_PEM,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
    });

    await adapter.getPageViews(range);
    currentTime += 3601 * 1000; // Past the 1-hour token lifetime.
    await adapter.getPageViews(range);

    const tokenExchangeCalls = fetchImpl.mock.calls.filter(([url]) => url === "https://oauth2.googleapis.com/token");
    expect(tokenExchangeCalls).toHaveLength(2);
  });

  it("throws a descriptive error when the token exchange responds with a non-2xx status", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, { status: 400 }));

    await expect(makeAdapter().getPageViews(range)).rejects.toThrow(/GA4 service-account token exchange failed \(400\)/);
  });

  it("throws a descriptive error when runReport responds with a non-2xx status", async () => {
    fetchImpl
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ error: { message: "PERMISSION_DENIED" } }, { status: 403 }));

    await expect(makeAdapter().getTrafficSources(range)).rejects.toThrow(/GA4 Data API runReport request failed \(403\)/);
  });

  it("returns an empty array when GA4 legitimately returns no rows (rows omitted entirely, per GA4's documented behavior for an empty result)", async () => {
    fetchImpl.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({ dimensionHeaders: [], metricHeaders: [] }));

    await expect(makeAdapter().getTrafficSources(range)).resolves.toEqual([]);
  });
});
