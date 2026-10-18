import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaypalHttpClient, PaypalApiError } from "../src/http-client.js";
import type { PaypalCreateOrderRequest } from "../src/paypal-types.js";

/**
 * Exercises the real request shapes this adapter sends against a recording
 * fetch fake -- no live PayPal developer account/app exists in this
 * environment (see design-discussion.md's "Real credential gate"), so every
 * response body here is shaped exactly like PayPal's real, documented REST
 * API responses confirmed live during this story's research (see
 * paypal-types.ts's top doc comment), not invented. PayPal's own canonical
 * sample order id (`5O190127TN364715T`) is reused here, the same id PayPal's
 * own docs use across every Orders v2 example.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createPaypalHttpClient", () => {
  let calls: { url: string; init: RequestInit | undefined }[];
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchImpl = vi.fn();
  });

  function trackingFetch(responder: (url: string, init: RequestInit | undefined) => Response) {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder(String(url), init);
    });
  }

  function tokenResponse() {
    return jsonResponse(200, { access_token: "A21AAFakeAccessToken", token_type: "Bearer", expires_in: 32400 });
  }

  it("exchanges client credentials for a real OAuth2 token via POST /v1/oauth2/token with HTTP Basic auth and grant_type=client_credentials, before the first real API call", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(200, { id: "5O190127TN364715T", status: "CREATED" })));
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.getOrder("5O190127TN364715T");

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("client-id:client-secret", "utf-8").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(calls[0]!.init?.body).toBe("grant_type=client_credentials");

    expect(calls[1]!.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T");
    expect(calls[1]!.init?.headers).toMatchObject({ Authorization: "Bearer A21AAFakeAccessToken" });
  });

  it("caches the access token across multiple calls instead of re-authenticating every request", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(200, { id: "5O190127TN364715T", status: "CREATED" })));
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.getOrder("5O190127TN364715T");
    await client.getOrder("5O190127TN364715T");
    await client.getOrder("5O190127TN364715T");

    const tokenCalls = calls.filter((call) => call.url.endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("createOrder POSTs to the real, confirmed /v2/checkout/orders endpoint with the exact request body", async () => {
    trackingFetch((url) =>
      url.endsWith("/v1/oauth2/token")
        ? tokenResponse()
        : jsonResponse(201, {
            id: "5O190127TN364715T",
            status: "CREATED",
            links: [
              { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" },
              { rel: "self", href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T" },
            ],
          }),
    );
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    const request: PaypalCreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: "order-1", amount: { currency_code: "USD", value: "19.99" } }],
      payment_source: { paypal: { experience_context: { return_url: "https://shop.example/success", cancel_url: "https://shop.example/cancel" } } },
    };
    const result = await client.createOrder(request);

    const apiCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"))!;
    expect(apiCall.init?.method).toBe("POST");
    expect(JSON.parse(apiCall.init!.body as string)).toEqual(request);
    expect(result.id).toBe("5O190127TN364715T");
    expect(result.links?.find((l) => l.rel === "approve")?.href).toBe("https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T");
  });

  it("captureOrder POSTs to the real, confirmed /v2/checkout/orders/{id}/capture endpoint", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(201, { id: "5O190127TN364715T", status: "COMPLETED", purchase_units: [{ custom_id: "order-1" }] })));
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.captureOrder("5O190127TN364715T");

    const apiCall = calls.find((call) => call.url.endsWith("/capture"))!;
    expect(apiCall.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture");
    expect(apiCall.init?.method).toBe("POST");
    expect(result.status).toBe("COMPLETED");
  });

  it("getOrder GETs /v2/checkout/orders/{id} and returns null (not throw) on a real 404", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(404, { name: "RESOURCE_NOT_FOUND" })));
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getOrder("unknown-order");
    expect(result).toBeNull();
  });

  it("verifyWebhookSignature POSTs to the real, confirmed /v1/notifications/verify-webhook-signature endpoint with the exact request body", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(200, { verification_status: "SUCCESS" })));
    const client = createPaypalHttpClient({ clientId: "client-id", clientSecret: "client-secret", fetchImpl: fetchImpl as unknown as typeof fetch });

    const body = {
      transmission_id: "b02c130c-...",
      transmission_time: "2026-10-18T12:00:00Z",
      cert_url: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-abc",
      auth_algo: "SHA256withRSA",
      transmission_sig: "sig==",
      webhook_id: "webhook-1",
      webhook_event: { id: "evt-1" },
    };
    const result = await client.verifyWebhookSignature(body);

    const apiCall = calls.find((call) => call.url.endsWith("/v1/notifications/verify-webhook-signature"))!;
    expect(apiCall.url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(JSON.parse(apiCall.init!.body as string)).toEqual(body);
    expect(result.verification_status).toBe("SUCCESS");
  });

  it("honors a custom baseUrl -- e.g. the real live base https://api-m.paypal.com", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(200, { id: "5O190127TN364715T", status: "CREATED" })));
    const client = createPaypalHttpClient({ clientId: "c", clientSecret: "s", baseUrl: "https://api-m.paypal.com", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.getOrder("5O190127TN364715T");

    expect(calls.some((call) => call.url.startsWith("https://api-m.paypal.com"))).toBe(true);
  });

  it("throws PaypalApiError with status and body for a non-404 error response", async () => {
    trackingFetch((url) => (url.endsWith("/v1/oauth2/token") ? tokenResponse() : jsonResponse(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "CURRENCY_NOT_SUPPORTED" }] })));
    const client = createPaypalHttpClient({ clientId: "c", clientSecret: "s", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getOrder("bad-order")).rejects.toThrow(PaypalApiError);
  });
});
