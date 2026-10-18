import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuickBooksHttpClient, QuickBooksApiError } from "../src/http-client.js";

/**
 * Exercises the real request shapes this adapter sends against a recording
 * fetch fake -- no live QuickBooks Online account/credentials exist in this
 * environment (see this package's top-level doc comments, quickbooks-types.ts),
 * so every response body here is shaped exactly like QuickBooks' real,
 * documented v3 Accounting API responses confirmed during this story's
 * research, not invented.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createQuickBooksHttpClient", () => {
  let calls: { url: string; init: RequestInit | undefined }[];
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchImpl = vi.fn();
  });

  it("createSalesEntity POSTs to the real, confirmed /v3/company/{realmId}/salesreceipt path with Bearer auth, minorversion, and the exact request body", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, {
        SalesReceipt: { Id: "123", SyncToken: "0", DocNumber: "order-1", TotalAmt: 20 },
        time: "2026-10-18T00:00:00.000-07:00",
      });
    });

    const client = createQuickBooksHttpClient({
      realmId: "9999",
      accessToken: "test-access-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createSalesEntity("SalesReceipt", {
      CustomerRef: { value: "42" },
      Line: [{ Amount: 20, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "7" }, Qty: 2, UnitPrice: 10 } }],
      DocNumber: "order-1",
      TxnDate: "2026-10-18",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://quickbooks.api.intuit.com/v3/company/9999/salesreceipt?minorversion=75");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Bearer test-access-token", "Content-Type": "application/json" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      CustomerRef: { value: "42" },
      Line: [{ Amount: 20, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "7" }, Qty: 2, UnitPrice: 10 } }],
      DocNumber: "order-1",
      TxnDate: "2026-10-18",
    });
    expect(result).toEqual({ Id: "123", SyncToken: "0", DocNumber: "order-1", TotalAmt: 20 });
  });

  it("uses the real sandbox base URL when environment is 'sandbox'", async () => {
    fetchImpl.mockImplementation(async (url: string) => {
      calls.push({ url: String(url), init: undefined });
      return jsonResponse(200, { Invoice: { Id: "1", SyncToken: "0" } });
    });
    const client = createQuickBooksHttpClient({ realmId: "1", environment: "sandbox", accessToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.createSalesEntity("Invoice", { CustomerRef: { value: "1" }, Line: [] });

    expect(calls[0]!.url).toBe("https://sandbox-quickbooks.api.intuit.com/v3/company/1/invoice?minorversion=75");
  });

  it("POSTs to /invoice (not /salesreceipt) for recordType 'Invoice'", async () => {
    fetchImpl.mockImplementation(async (url: string) => {
      calls.push({ url: String(url), init: undefined });
      return jsonResponse(200, { Invoice: { Id: "1", SyncToken: "0" } });
    });
    const client = createQuickBooksHttpClient({ realmId: "1", accessToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.createSalesEntity("Invoice", { CustomerRef: { value: "1" }, Line: [] });

    expect(calls[0]!.url).toContain("/v3/company/1/invoice");
  });

  it("throws QuickBooksApiError with status and body for a non-ok, non-401 response", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(400, { Fault: { Error: [{ Message: "Validation error" }] } }));
    const client = createQuickBooksHttpClient({ realmId: "1", accessToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createSalesEntity("SalesReceipt", { CustomerRef: { value: "1" }, Line: [] })).rejects.toThrow(QuickBooksApiError);
  });

  it("throws a clear error when the create response's envelope doesn't carry the expected entity key", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(200, { time: "2026-10-18T00:00:00.000Z" }));
    const client = createQuickBooksHttpClient({ realmId: "1", accessToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createSalesEntity("SalesReceipt", { CustomerRef: { value: "1" }, Line: [] })).rejects.toThrow(/did not carry a "SalesReceipt" key/);
  });

  it("refreshes an access token via the real grant_type=refresh_token exchange when none is supplied upfront, then uses it", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2/v1/tokens/bearer")) {
        expect(init?.method).toBe("POST");
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return jsonResponse(200, { access_token: "fresh-token", refresh_token: "new-refresh-token", expires_in: 3600 });
      }
      return jsonResponse(200, { SalesReceipt: { Id: "1", SyncToken: "0" } });
    });

    const onTokenRefreshed = vi.fn();
    const client = createQuickBooksHttpClient({
      realmId: "1",
      oauth: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "old-refresh-token" },
      onTokenRefreshed,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.createSalesEntity("SalesReceipt", { CustomerRef: { value: "1" }, Line: [] });

    expect(calls[0]!.url).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(calls[1]!.init?.headers).toMatchObject({ Authorization: "Bearer fresh-token" });
    expect(onTokenRefreshed).toHaveBeenCalledWith({ accessToken: "fresh-token", refreshToken: "new-refresh-token" });
  });

  it("refreshes once and retries on a 401 when oauth credentials are configured alongside a stale accessToken", async () => {
    let salesReceiptCallCount = 0;
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2/v1/tokens/bearer")) {
        return jsonResponse(200, { access_token: "fresh-token", refresh_token: "new-refresh-token", expires_in: 3600 });
      }
      salesReceiptCallCount++;
      if (salesReceiptCallCount === 1) return jsonResponse(401, { Fault: { Error: [{ Message: "Token expired" }] } });
      return jsonResponse(200, { SalesReceipt: { Id: "1", SyncToken: "0" } });
    });

    const client = createQuickBooksHttpClient({
      realmId: "1",
      accessToken: "stale-token",
      oauth: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "old-refresh-token" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createSalesEntity("SalesReceipt", { CustomerRef: { value: "1" }, Line: [] });

    expect(result).toEqual({ Id: "1", SyncToken: "0" });
    expect(salesReceiptCallCount).toBe(2); // first 401, refreshed, retried once
  });
});
