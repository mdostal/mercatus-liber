import { describe, expect, it, vi } from "vitest";
import { QUICKBOOKS_TOKEN_URL, QuickBooksOAuthError, refreshQuickBooksAccessToken } from "../src/oauth.js";

describe("refreshQuickBooksAccessToken", () => {
  it("POSTs grant_type=refresh_token to the real, confirmed token endpoint with HTTP Basic auth, returning the new access + refresh tokens", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(QUICKBOOKS_TOKEN_URL);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      });
      expect(String(init?.body)).toBe(new URLSearchParams({ grant_type: "refresh_token", refresh_token: "old-refresh" }).toString());
      return new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }), { status: 200 });
    });

    const tokens = await refreshQuickBooksAccessToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "old-refresh",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(tokens).toEqual({ accessToken: "new-access", refreshToken: "new-refresh", expiresInSeconds: 3600 });
  });

  it("throws QuickBooksOAuthError on a non-ok response or a response missing the real token fields", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));

    await expect(
      refreshQuickBooksAccessToken({
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "expired-refresh",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(QuickBooksOAuthError);
  });
});
