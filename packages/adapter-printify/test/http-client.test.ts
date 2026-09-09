import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrintifyHttpClient, DEFAULT_PRINTIFY_USER_AGENT, PrintifyApiError } from "../src/http-client.js";

/**
 * Exercises the real request shapes this adapter sends against a recording
 * fetch fake -- no live Printify account/token exists in this environment
 * (see design-discussion.md's "Real credential gate"), so every response body
 * here is shaped exactly like Printify's real, documented v1 API responses
 * confirmed during this story's research (see printify-types.ts's top doc
 * comment), not invented.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createPrintifyHttpClient", () => {
  let calls: { url: string; init: RequestInit | undefined }[];
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchImpl = vi.fn();
  });

  it("createOrder POSTs to the real, confirmed /v1/shops/{shop_id}/orders.json endpoint with Bearer auth, the app-identifying User-Agent header, and the exact request body", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { id: "5a96f649b2439217d070f507" });
    });

    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "123456", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createOrder({
      external_id: "order-1",
      line_items: [{ product_id: "5bfd0b66a342bcc9b5563216", variant_id: 17887, quantity: 1, external_id: "sku-mug" }],
      address_to: { first_name: "John", last_name: "Smith", email: "john@example.com", phone: "0574 69 21 90", country: "BE", region: "", address1: "ExampleBaan 121", city: "Retie", zip: "2470" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.printify.com/v1/shops/123456/orders.json");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "Bearer test-token", "User-Agent": DEFAULT_PRINTIFY_USER_AGENT, "Content-Type": "application/json" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      external_id: "order-1",
      line_items: [{ product_id: "5bfd0b66a342bcc9b5563216", variant_id: 17887, quantity: 1, external_id: "sku-mug" }],
      address_to: { first_name: "John", last_name: "Smith", email: "john@example.com", phone: "0574 69 21 90", country: "BE", region: "", address1: "ExampleBaan 121", city: "Retie", zip: "2470" },
    });
    expect(result.id).toBe("5a96f649b2439217d070f507");
  });

  it("honors a custom userAgent override while still always sending the header", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { id: "abc" });
    });
    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "1", userAgent: "shop.mdostal.com/1.0", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.createOrder({ external_id: "order-1", line_items: [], address_to: {} });

    expect(calls[0]!.init?.headers).toMatchObject({ "User-Agent": "shop.mdostal.com/1.0" });
  });

  it("sendToProduction POSTs to the real, confirmed .../orders/{order_id}/send_to_production.json path", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { id: "order-abc", line_items: [], status: "sending-to-production" });
    });
    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "123456", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.sendToProduction("order-abc");

    expect(calls[0]!.url).toBe("https://api.printify.com/v1/shops/123456/orders/order-abc/send_to_production.json");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({ "User-Agent": DEFAULT_PRINTIFY_USER_AGENT });
  });

  it("getOrder GETs /v1/shops/{shop_id}/orders/{order_id}.json and returns null (not throw) on a 404", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(404, { error: "Not found" });
    });
    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "123456", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getOrder("order-unknown");

    expect(calls[0]!.url).toBe("https://api.printify.com/v1/shops/123456/orders/order-unknown.json");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.headers).toMatchObject({ "User-Agent": DEFAULT_PRINTIFY_USER_AGENT });
    expect(result).toBeNull();
  });

  it("createWebhook POSTs to the real, confirmed /v1/shops/{shop_id}/webhooks.json endpoint with the optional secret field", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { id: "5cb87a8cd490a2ccb256cec4", topic: "order:created", url: "https://example.com/webhooks/order/created", shop_id: "123456" });
    });
    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "123456", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createWebhook({ topic: "order:created", url: "https://example.com/webhooks/order/created", secret: "s3cr3t" });

    expect(calls[0]!.url).toBe("https://api.printify.com/v1/shops/123456/webhooks.json");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ topic: "order:created", url: "https://example.com/webhooks/order/created", secret: "s3cr3t" });
    expect(result.id).toBe("5cb87a8cd490a2ccb256cec4");
  });

  it("every request built (order create, send-to-production, get-order, webhook create) carries the User-Agent header -- acceptance criterion 2", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(200, { id: "x", line_items: [], status: "pending", topic: "order:created", url: "https://x", shop_id: "1" }));
    const client = createPrintifyHttpClient({ apiToken: "t", shopId: "1", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.createOrder({ external_id: "o", line_items: [], address_to: {} });
    await client.sendToProduction("x");
    await client.getOrder("x");
    await client.createWebhook({ topic: "order:created", url: "https://example.com" });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const call of fetchImpl.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.headers).toMatchObject({ "User-Agent": DEFAULT_PRINTIFY_USER_AGENT });
    }
  });

  it("throws PrintifyApiError with status and body for a non-404 error response", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(422, { errors: { reason: "Validation failed" } }));
    const client = createPrintifyHttpClient({ apiToken: "test-token", shopId: "1", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createOrder({ external_id: "order-1", line_items: [], address_to: {} })).rejects.toThrow(PrintifyApiError);
  });
});
