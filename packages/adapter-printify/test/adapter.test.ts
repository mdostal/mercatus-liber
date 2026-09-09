import { createHmac } from "node:crypto";
import type { FulfillmentLineRecord } from "@mercatus-liber/fulfillment";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertPrintifyAdapterSatisfiesFulfillmentAdapter } from "../src/fulfillment-adapter-compat.js";
import type { PrintifyHttpClient } from "../src/http-client.js";
import { createPrintifyFulfillmentAdapter, PRINTIFY_PROVIDER, type PrintifyFulfillmentAdapterConfig } from "../src/index.js";
import type { PrintifyCatalogTarget, PrintifyRecipientAddress } from "../src/mapping.js";
import { PrintifyWebhookSignatureInvalidError, PrintifyWebhookSignatureNotConfiguredError } from "../src/webhook.js";

/**
 * Every response fixture below is shaped exactly like Printify's real,
 * documented v1 API responses confirmed during this story's research (see
 * printify-types.ts's top doc comment, fetched directly from
 * developers.printify.com's raw HTML on 2026-09-09) -- not invented shapes.
 * No live Printify account/token exists in this environment
 * (design-discussion.md's "Real credential gate", same disclosed pattern as
 * epics 27/42/46).
 */
function fakeClient(overrides: Partial<PrintifyHttpClient> = {}): PrintifyHttpClient & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createOrder: [], sendToProduction: [], getOrder: [], createWebhook: [] };
  return {
    calls,
    async createOrder(body) {
      calls.createOrder!.push(body);
      return overrides.createOrder ? overrides.createOrder(body) : { id: "5a96f649b2439217d070f507" };
    },
    async sendToProduction(orderId) {
      calls.sendToProduction!.push(orderId);
      return overrides.sendToProduction
        ? overrides.sendToProduction(orderId)
        : {
            id: orderId,
            line_items: [{ product_id: "5b05842f3921c9547531758d", variant_id: 17887, quantity: 2, external_id: "sku-mug", status: "sending-to-production" }],
            status: "sending-to-production",
          };
    },
    async getOrder(orderId) {
      calls.getOrder!.push(orderId);
      return overrides.getOrder ? overrides.getOrder(orderId) : null;
    },
    async createWebhook(body) {
      calls.createWebhook!.push(body);
      return overrides.createWebhook ? overrides.createWebhook(body) : { id: "wh-1", topic: (body as { topic: string }).topic, url: (body as { url: string }).url, shop_id: "123456" };
    },
  };
}

const recipient: PrintifyRecipientAddress = { first_name: "Ada", last_name: "Lovelace", address1: "1 Analytical Engine Way", city: "London", country: "GB", zip: "SW1A 1AA", email: "ada@example.com", phone: "555-0100" };

function baseConfig(client: PrintifyHttpClient, overrides: Partial<PrintifyFulfillmentAdapterConfig> = {}): PrintifyFulfillmentAdapterConfig {
  return {
    apiToken: "test-token",
    shopId: "123456",
    httpClient: client,
    async resolveRecipient() {
      return recipient;
    },
    async resolveCatalogTarget(skuId: string): Promise<PrintifyCatalogTarget> {
      return skuId === "sku-mug" ? { productId: "5b05842f3921c9547531758d", variantId: 17887 } : { productId: "other-product", variantId: 9999 };
    },
    async resolveExternalOrderId(orderId: string) {
      return orderId === "order-1" ? "5a96f649b2439217d070f507" : null;
    },
    ...overrides,
  };
}

describe("createPrintifyFulfillmentAdapter", () => {
  describe("submitOrder", () => {
    it("implements the real create-then-send-to-production flow: POST /v1/shops/{shop_id}/orders.json then POST .../send_to_production.json", async () => {
      const client = fakeClient();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      const records = await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-mug", quantity: 2 }] });

      expect(client.calls.createOrder).toHaveLength(1);
      expect(client.calls.sendToProduction).toHaveLength(1);
      expect(client.calls.sendToProduction![0]).toBe("5a96f649b2439217d070f507"); // the created order's real id, sent to production via a second real call

      expect(records).toEqual<FulfillmentLineRecord[]>([
        {
          orderId: "order-1",
          skuId: "sku-mug",
          provider: PRINTIFY_PROVIDER,
          externalOrderId: "5a96f649b2439217d070f507",
          status: "submitted",
          trackingNumber: null,
          trackingUrl: null,
        },
      ]);
    });

    it("builds the real, confirmed v1 request shape: order-level external_id = orderId (REQUIRED per the docs' property table), address_to from resolveRecipient, line_items carrying product_id/variant_id/quantity/item-level external_id=skuId", async () => {
      const client = fakeClient();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      await adapter.submitOrder({
        orderId: "order-42",
        items: [
          { skuId: "sku-mug", quantity: 2 },
          { skuId: "sku-shirt", quantity: 1 },
        ],
      });

      expect(client.calls.createOrder![0]).toEqual({
        external_id: "order-42",
        line_items: [
          { product_id: "5b05842f3921c9547531758d", variant_id: 17887, quantity: 2, external_id: "sku-mug" },
          { product_id: "other-product", variant_id: 9999, quantity: 1, external_id: "sku-shirt" },
        ],
        address_to: recipient,
      });
    });
  });

  describe("getOrderStatus", () => {
    it("returns [] when resolveExternalOrderId cannot resolve our orderId to a real Printify order id (this adapter never submitted it)", async () => {
      const client = fakeClient();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      await expect(adapter.getOrderStatus("never-submitted")).resolves.toEqual([]);
      expect(client.calls.getOrder).toHaveLength(0); // never even calls the live API without a resolved id
    });

    it("resolves our orderId to Printify's own order id, then GETs it and returns [] (not throw) on a real 404", async () => {
      const client = fakeClient({ getOrder: async () => null });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      await expect(adapter.getOrderStatus("order-1")).resolves.toEqual([]);
      expect(client.calls.getOrder![0]).toBe("5a96f649b2439217d070f507");
    });

    it("maps real per-line-item status 'in-production' (not the order-level status) to 'submitted'", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          id: "5a96f649b2439217d070f507",
          status: "in-production",
          line_items: [{ product_id: "p", variant_id: 17887, quantity: 2, external_id: "sku-mug", status: "in-production" }],
        }),
      });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");

      expect(records).toEqual<FulfillmentLineRecord[]>([
        { orderId: "order-1", skuId: "sku-mug", provider: PRINTIFY_PROVIDER, externalOrderId: "5a96f649b2439217d070f507", status: "submitted", trackingNumber: null, trackingUrl: null },
      ]);
    });

    it("maps a 'fulfilled' line item with no shipments to 'shipped' (not 'delivered')", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          id: "5a96f649b2439217d070f507",
          status: "fulfilled",
          line_items: [{ product_id: "p", variant_id: 17887, quantity: 1, external_id: "sku-mug", status: "fulfilled" }],
        }),
      });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");
      expect(records[0]).toMatchObject({ status: "shipped", trackingNumber: null, trackingUrl: null });
    });

    it("maps a 'fulfilled' line item to 'delivered' and surfaces the single shipment's real tracking number/url when the order has exactly one shipment with a delivered_at", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          id: "5a96f649b2439217d070f507",
          status: "fulfilled",
          line_items: [{ product_id: "p", variant_id: 17887, quantity: 1, external_id: "sku-mug", status: "fulfilled" }],
          shipments: [{ carrier: "usps", number: "94001116990045395649372", url: "http://example.com/94001116990045395649372", delivered_at: "2017-04-18 13:24:28+00:00" }],
        }),
      });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");
      expect(records[0]).toMatchObject({ status: "delivered", trackingNumber: "94001116990045395649372", trackingUrl: "http://example.com/94001116990045395649372" });
    });

    it("does not attribute tracking to any line item when an order has multiple shipments (real, disclosed lack of per-line-item shipment linkage in Printify's own response shape)", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          id: "5a96f649b2439217d070f507",
          status: "partially-fulfilled",
          line_items: [
            { product_id: "p", variant_id: 1, quantity: 1, external_id: "sku-mug", status: "fulfilled" },
            { product_id: "p2", variant_id: 2, quantity: 1, external_id: "sku-shirt", status: "in-production" },
          ],
          shipments: [
            { carrier: "usps", number: "AAA", url: "https://a", delivered_at: "" },
            { carrier: "ups", number: "BBB", url: "https://b", delivered_at: "" },
          ],
        }),
      });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");
      for (const record of records) {
        expect(record.trackingNumber).toBeNull();
        expect(record.trackingUrl).toBeNull();
      }
    });

    it.each(["on-hold", "sending-to-production", "has-issues", "canceled"] as const)(
      "narrows real Printify line-item statuses with no FulfillmentLineStatus equivalent ('%s') to 'submitted', not invented values",
      async (printifyStatus) => {
        const client = fakeClient({
          getOrder: async () => ({
            id: "5a96f649b2439217d070f507",
            status: "on-hold",
            line_items: [{ product_id: "p", variant_id: 1, quantity: 1, external_id: "sku-mug", status: printifyStatus }],
          }),
        });
        const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));
        const records = await adapter.getOrderStatus("order-1");
        expect(records[0]!.status).toBe("submitted");
      },
    );

    it("falls back to metadata.external_id, then a synthesized id, when a line item's top-level external_id is absent (real, disclosed doc inconsistency -- see printify-types.ts)", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          id: "5a96f649b2439217d070f507",
          status: "fulfilled",
          line_items: [
            { product_id: "p", variant_id: 1, quantity: 1, status: "fulfilled", metadata: { external_id: "sku-nested" } },
            { product_id: "p", variant_id: 2, quantity: 1, status: "fulfilled" },
          ],
        }),
      });
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));
      const records = await adapter.getOrderStatus("order-1");
      expect(records[0]!.skuId).toBe("sku-nested");
      expect(records[1]!.skuId).toBe("pfy-item-2-1");
    });
  });

  describe("handleWebhookEvent", () => {
    it("fails closed with PrintifyWebhookSignatureNotConfiguredError when neither webhookSecret nor verifyWebhookSignature is configured", async () => {
      const client = fakeClient();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client));

      await expect(adapter.handleWebhookEvent!(JSON.stringify({ id: "e1", type: "order:created", created_at: "x", resource: { id: "o1", type: "order", data: {} } }), "sha256=bad")).rejects.toThrow(
        PrintifyWebhookSignatureNotConfiguredError,
      );
    });

    it("verifies using the real, confirmed HMAC-SHA256 X-Pfy-Signature scheme when webhookSecret is configured, throwing PrintifyWebhookSignatureInvalidError on a mismatch", async () => {
      const client = fakeClient();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client, { webhookSecret: "shared-secret" }));
      const rawBody = JSON.stringify({ id: "e1", type: "order:created", created_at: "x", resource: { id: "o1", type: "order", data: {} } });

      await expect(adapter.handleWebhookEvent!(rawBody, "sha256=0000000000000000000000000000000000000000000000000000000000000000")).rejects.toThrow(PrintifyWebhookSignatureInvalidError);

      const realSignature = `sha256=${createHmac("sha256", "shared-secret").update(rawBody).digest("hex")}`;
      await expect(adapter.handleWebhookEvent!(rawBody, realSignature)).resolves.toBeUndefined();
    });

    it("honors a custom verifyWebhookSignature override instead of the default webhookSecret-based verifier", async () => {
      const client = fakeClient();
      const verifyWebhookSignature = vi.fn().mockResolvedValue(true);
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client, { verifyWebhookSignature }));
      const rawBody = JSON.stringify({ id: "e1", type: "order:created", created_at: "x", resource: { id: "o1", type: "order", data: {} } });

      await adapter.handleWebhookEvent!(rawBody, "any-signature");

      expect(verifyWebhookSignature).toHaveBeenCalledWith(rawBody, "any-signature");
    });

    it.each(["order:created", "order:updated", "order:sent-to-production", "order:shipment:created", "order:shipment:delivered"] as const)(
      "parses the real, documented '%s' event's confirmed envelope ({ id, type, created_at, resource: { id, type, data } }) and invokes onWebhookEvent",
      async (type) => {
        const client = fakeClient();
        const onWebhookEvent = vi.fn();
        const adapter = createPrintifyFulfillmentAdapter(baseConfig(client, { verifyWebhookSignature: async () => true, onWebhookEvent }));

        const data = { shop_id: 815256 };
        await adapter.handleWebhookEvent!(JSON.stringify({ id: "653b6be8-2ff7-4ab5-a7a6-6889a8b3bbf5", type, created_at: "2022-05-17 15:00:00+00:00", resource: { id: "5a96f649b2439217d070f507", type: "order", data } }), "sig");

        expect(onWebhookEvent).toHaveBeenCalledWith({ type, id: "653b6be8-2ff7-4ab5-a7a6-6889a8b3bbf5", resourceId: "5a96f649b2439217d070f507", data });
      },
    );

    it("passes an unrecognized-but-real event type through as 'other' rather than throwing", async () => {
      const client = fakeClient();
      const onWebhookEvent = vi.fn();
      const adapter = createPrintifyFulfillmentAdapter(baseConfig(client, { verifyWebhookSignature: async () => true, onWebhookEvent }));

      await adapter.handleWebhookEvent!(JSON.stringify({ id: "e1", type: "shop:disconnected", created_at: "x", resource: { id: "815256", type: "shop", data: null } }), "sig");

      expect(onWebhookEvent).toHaveBeenCalledWith({ type: "other", rawType: "shop:disconnected", id: "e1", resourceId: "815256", data: null });
    });
  });

  describe("FulfillmentAdapter contract coverage", () => {
    it("passes the real compile-time type-compatibility proof (fulfillment-adapter-compat.ts) and exposes every required + the optional method at runtime", () => {
      const client = fakeClient();
      const adapter = assertPrintifyAdapterSatisfiesFulfillmentAdapter(baseConfig(client));

      expect(typeof adapter.submitOrder).toBe("function");
      expect(typeof adapter.getOrderStatus).toBe("function");
      expect(typeof adapter.handleWebhookEvent).toBe("function");
    });
  });
});
