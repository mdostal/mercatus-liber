import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrintfulHttpClient, PrintfulApiError } from "../src/http-client.js";

/**
 * Exercises the real request shapes this adapter sends against a recording
 * fetch fake -- no live Printful account/token exists in this environment
 * (see design-discussion.md's "Real credential gate"), so every response body
 * here is shaped exactly like Printful's real, documented v2 API responses
 * confirmed during this story's research (see printful-types.ts's top doc
 * comment), not invented.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createPrintfulHttpClient", () => {
  let calls: { url: string; init: RequestInit | undefined }[];
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchImpl = vi.fn();
  });

  it("createOrder POSTs to the real, confirmed /v2/orders endpoint with Bearer auth and the exact request body", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, {
        data: {
          id: 123,
          external_id: "order-1",
          store_id: 10,
          shipping: "STANDARD",
          status: "draft",
          created_at: "2026-09-09T00:00:00Z",
          updated_at: "2026-09-09T00:00:00Z",
          recipient: { name: "John Smith", address1: "19749 Dearborn St", city: "Chatsworth", country_code: "US", state_code: "CA", zip: "91311" },
          order_items: [
            { id: 1234, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-mug", quantity: 1, price: "8.00", retail_price: "10.00", currency: "USD" },
          ],
        },
      });
    });

    const client = createPrintfulHttpClient({ apiToken: "test-token", storeId: "10", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createOrder({
      external_id: "order-1",
      recipient: { name: "John Smith", address1: "19749 Dearborn St", city: "Chatsworth", country_code: "US", state_code: "CA", zip: "91311" },
      order_items: [{ source: "catalog", catalog_variant_id: 4011, quantity: 1, external_id: "sku-mug" }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.printful.com/v2/orders");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Bearer test-token", "X-PF-Store-Id": "10", "Content-Type": "application/json" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      external_id: "order-1",
      recipient: { name: "John Smith", address1: "19749 Dearborn St", city: "Chatsworth", country_code: "US", state_code: "CA", zip: "91311" },
      order_items: [{ source: "catalog", catalog_variant_id: 4011, quantity: 1, external_id: "sku-mug" }],
    });
    expect(result.data.id).toBe(123);
    expect(result.data.status).toBe("draft");
  });

  it("confirmOrder POSTs to the real, confirmed /v2/orders/{id}/confirmation path (not /confirm)", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { data: { id: 123, external_id: "order-1", status: "pending", recipient: {}, order_items: [] } });
    });
    const client = createPrintfulHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.confirmOrder(123);

    expect(calls[0]!.url).toBe("https://api.printful.com/v2/orders/123/confirmation");
    expect(calls[0]!.init?.method).toBe("POST");
  });

  it("getOrder GETs /v2/orders/@{external_id} and returns null (not throw) on a 404", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(404, { error: { message: "Not found" } });
    });
    const client = createPrintfulHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getOrder("@order-unknown");

    expect(calls[0]!.url).toBe("https://api.printful.com/v2/orders/@order-unknown");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(result).toBeNull();
  });

  it("getShipments GETs /v2/orders/{ref}/shipments and returns an empty envelope (not throw) on a 404", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(404, {}));
    const client = createPrintfulHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getShipments("@order-1");
    expect(result).toEqual({ data: [] });
  });

  it("throws PrintfulApiError with status and body for a non-404 error response", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(400, { error: { message: "Bad Request" } }));
    const client = createPrintfulHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(
      client.createOrder({ external_id: "order-1", recipient: {}, order_items: [] }),
    ).rejects.toThrow(PrintfulApiError);
  });
});
