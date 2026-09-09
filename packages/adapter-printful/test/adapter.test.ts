import type { FulfillmentLineRecord } from "@mercatus-liber/fulfillment";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertPrintfulAdapterSatisfiesFulfillmentAdapter } from "../src/fulfillment-adapter-compat.js";
import { createPrintfulFulfillmentAdapter, PRINTFUL_PROVIDER, type PrintfulFulfillmentAdapterConfig } from "../src/index.js";
import type { PrintfulHttpClient } from "../src/http-client.js";
import type { PrintfulCatalogTarget, PrintfulRecipientAddress } from "../src/mapping.js";
import { PrintfulWebhookSignatureInvalidError, PrintfulWebhookSignatureUnconfirmedError } from "../src/webhook.js";

/**
 * Every response fixture below is shaped exactly like Printful's real,
 * documented v2 API responses confirmed during this story's research (see
 * printful-types.ts's top doc comment and the addendum's own confirmed
 * draft-then-confirm/Wallet-billing flow) -- not invented shapes. No live
 * Printful account/token exists in this environment (design-discussion.md's
 * "Real credential gate", same disclosed pattern as epics 27/46).
 */
function fakeClient(overrides: Partial<PrintfulHttpClient> = {}): PrintfulHttpClient & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createOrder: [], confirmOrder: [], getOrder: [], getShipments: [] };
  return {
    calls,
    async createOrder(body) {
      calls.createOrder!.push(body);
      return (overrides.createOrder ?? (async () => ({
        data: {
          id: 555,
          external_id: (body as { external_id?: string }).external_id ?? null,
          store_id: 10,
          shipping: "STANDARD",
          status: "draft",
          created_at: "2026-09-09T00:00:00Z",
          updated_at: "2026-09-09T00:00:00Z",
          recipient: {},
          order_items: (body as { order_items: { catalog_variant_id: number; external_id?: string; quantity: number }[] }).order_items.map((item, i) => ({
            id: 1000 + i,
            type: "order_item",
            source: "catalog",
            catalog_variant_id: item.catalog_variant_id,
            external_id: item.external_id ?? null,
            quantity: item.quantity,
          })),
        },
      })))(body);
    },
    async confirmOrder(orderId) {
      calls.confirmOrder!.push(orderId);
      return overrides.confirmOrder
        ? overrides.confirmOrder(orderId)
        : {
            data: {
              id: orderId,
              external_id: "order-1",
              store_id: 10,
              shipping: "STANDARD",
              status: "pending",
              created_at: "2026-09-09T00:00:00Z",
              updated_at: "2026-09-09T00:00:00Z",
              recipient: {},
              order_items: [{ id: 1000, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-mug", quantity: 2 }],
            },
          };
    },
    async getOrder(ref) {
      calls.getOrder!.push(ref);
      return overrides.getOrder ? overrides.getOrder(ref) : null;
    },
    async getShipments(ref) {
      calls.getShipments!.push(ref);
      return overrides.getShipments ? overrides.getShipments(ref) : { data: [] };
    },
  };
}

const recipient: PrintfulRecipientAddress = { name: "Ada Lovelace", address1: "1 Analytical Engine Way", city: "London", country_code: "GB", zip: "SW1A 1AA" };

function baseConfig(client: PrintfulHttpClient): PrintfulFulfillmentAdapterConfig {
  return {
    apiToken: "test-token",
    httpClient: client,
    async resolveRecipient() {
      return recipient;
    },
    async resolveCatalogTarget(skuId: string): Promise<PrintfulCatalogTarget> {
      return { catalogVariantId: skuId === "sku-mug" ? 4011 : 9999, placements: [{ placement: "front", technique: "dtg", layers: [{ type: "file", url: "https://example.com/logo.png" }] }] };
    },
  };
}

describe("createPrintfulFulfillmentAdapter", () => {
  describe("submitOrder", () => {
    it("implements the real draft-then-confirm flow: POST /v2/orders (draft) then POST .../confirmation", async () => {
      const client = fakeClient();
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      const records = await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-mug", quantity: 2 }] });

      expect(client.calls.createOrder).toHaveLength(1);
      expect(client.calls.confirmOrder).toHaveLength(1);
      expect(client.calls.confirmOrder![0]).toBe(555); // the draft's id, confirmed via a second real call

      expect(records).toEqual<FulfillmentLineRecord[]>([
        {
          orderId: "order-1",
          skuId: "sku-mug",
          provider: PRINTFUL_PROVIDER,
          externalOrderId: "555",
          status: "submitted",
          trackingNumber: null,
          trackingUrl: null,
        },
      ]);
    });

    it("builds the real, confirmed v2 request shape: order-level external_id = orderId, recipient from resolveRecipient, order_items carrying catalog_variant_id/quantity/item-level external_id=skuId/placements", async () => {
      const client = fakeClient();
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      await adapter.submitOrder({
        orderId: "order-42",
        items: [
          { skuId: "sku-mug", quantity: 2 },
          { skuId: "sku-shirt", quantity: 1 },
        ],
      });

      expect(client.calls.createOrder![0]).toEqual({
        external_id: "order-42",
        recipient,
        order_items: [
          {
            source: "catalog",
            catalog_variant_id: 4011,
            quantity: 2,
            external_id: "sku-mug",
            placements: [{ placement: "front", technique: "dtg", layers: [{ type: "file", url: "https://example.com/logo.png" }] }],
          },
          {
            source: "catalog",
            catalog_variant_id: 9999,
            quantity: 1,
            external_id: "sku-shirt",
            placements: [{ placement: "front", technique: "dtg", layers: [{ type: "file", url: "https://example.com/logo.png" }] }],
          },
        ],
      });
    });

    it("omits optional catalog-target fields (retail_price/name) from the request when the resolver doesn't supply them", async () => {
      const client = fakeClient();
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-mug", quantity: 1 }] });

      const item = (client.calls.createOrder![0] as { order_items: Record<string, unknown>[] }).order_items[0]!;
      expect(item).not.toHaveProperty("retail_price");
      expect(item).not.toHaveProperty("name");
    });
  });

  describe("getOrderStatus", () => {
    it("returns [] for an order Printful has never seen, without throwing (real 404 -> null contract)", async () => {
      const client = fakeClient({ getOrder: async () => null });
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      await expect(adapter.getOrderStatus("never-submitted")).resolves.toEqual([]);
      expect(client.calls.getOrder![0]).toBe("@never-submitted");
    });

    it("maps a draft/pending order with no shipments to status 'submitted', trackingNumber null (real schema has no such field)", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          data: {
            id: 555,
            external_id: "order-1",
            status: "pending",
            recipient: {},
            order_items: [{ id: 1000, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-mug", quantity: 2 }],
          },
        }),
        getShipments: async () => ({ data: [] }),
      });
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");

      expect(records).toEqual<FulfillmentLineRecord[]>([
        { orderId: "order-1", skuId: "sku-mug", provider: PRINTFUL_PROVIDER, externalOrderId: "555", status: "submitted", trackingNumber: null, trackingUrl: null },
      ]);
    });

    it("maps a 'fulfilled' order status to 'shipped' and surfaces a matching shipment's real tracking_url", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          data: {
            id: 555,
            external_id: "order-1",
            status: "fulfilled",
            recipient: {},
            order_items: [{ id: 1000, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-mug", quantity: 2 }],
          },
        }),
        getShipments: async () => ({
          data: [
            {
              id: 9,
              order_id: 555,
              shipment_status: "shipped",
              delivery_status: "in_transit",
              tracking_url: "https://track.example/1Z999",
              shipment_items: [{ order_item_id: 1000, quantity: 2 }],
            },
          ],
        }),
      });
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");

      expect(records[0]).toMatchObject({ status: "shipped", trackingNumber: null, trackingUrl: "https://track.example/1Z999" });
    });

    it("maps a shipment with real delivery_status 'delivered' to status 'delivered'", async () => {
      const client = fakeClient({
        getOrder: async () => ({
          data: {
            id: 555,
            external_id: "order-1",
            status: "fulfilled",
            recipient: {},
            order_items: [{ id: 1000, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-mug", quantity: 1 }],
          },
        }),
        getShipments: async () => ({
          data: [{ id: 9, order_id: 555, shipment_status: "shipped", delivery_status: "delivered", tracking_url: "https://track.example/1Z999", shipment_items: [{ order_item_id: 1000, quantity: 1 }] }],
        }),
      });
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      const records = await adapter.getOrderStatus("order-1");
      expect(records[0]).toMatchObject({ status: "delivered" });
    });

    it("narrows real Printful order statuses with no FulfillmentLineStatus equivalent ('failed'/'canceled'/'onhold') to 'submitted', not invented values", async () => {
      for (const printfulStatus of ["failed", "canceled", "onhold", "inprocess", "partial", "draft"] as const) {
        const client = fakeClient({
          getOrder: async () => ({
            data: { id: 555, external_id: "order-1", status: printfulStatus, recipient: {}, order_items: [{ id: 1, type: "order_item", source: "catalog", catalog_variant_id: 1, external_id: "sku-mug", quantity: 1 }] },
          }),
          getShipments: async () => ({ data: [] }),
        });
        const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));
        const records = await adapter.getOrderStatus("order-1");
        expect(records[0]!.status).toBe("submitted");
      }
    });
  });

  describe("handleWebhookEvent", () => {
    it("fails closed with PrintfulWebhookSignatureUnconfirmedError when no verifier is configured (honest disclosure of the unconfirmable signature format, not a guessed scheme)", async () => {
      const client = fakeClient();
      const adapter = createPrintfulFulfillmentAdapter(baseConfig(client));

      await expect(adapter.handleWebhookEvent!(JSON.stringify({ type: "order_created", data: {} }), "sig")).rejects.toThrow(
        PrintfulWebhookSignatureUnconfirmedError,
      );
    });

    it("throws PrintfulWebhookSignatureInvalidError when a configured verifier rejects the signature", async () => {
      const client = fakeClient();
      const adapter = createPrintfulFulfillmentAdapter({ ...baseConfig(client), verifyWebhookSignature: async () => false });

      await expect(adapter.handleWebhookEvent!(JSON.stringify({ type: "order_created", data: {} }), "bad-sig")).rejects.toThrow(
        PrintfulWebhookSignatureInvalidError,
      );
    });

    it.each(["order_created", "order_updated", "shipment_sent", "shipment_delivered"] as const)(
      "verifies then parses the real, documented '%s' event type and invokes onWebhookEvent",
      async (type) => {
        const client = fakeClient();
        const onWebhookEvent = vi.fn();
        const adapter = createPrintfulFulfillmentAdapter({
          ...baseConfig(client),
          verifyWebhookSignature: async () => true,
          onWebhookEvent,
        });

        const data = { order: { id: 555 } };
        await adapter.handleWebhookEvent!(JSON.stringify({ type, created: 123, retries: 0, store: 10, data }), "sig");

        expect(onWebhookEvent).toHaveBeenCalledWith({ type, data });
      },
    );

    it("passes an unrecognized-but-real event type through as 'other' rather than throwing", async () => {
      const client = fakeClient();
      const onWebhookEvent = vi.fn();
      const adapter = createPrintfulFulfillmentAdapter({ ...baseConfig(client), verifyWebhookSignature: async () => true, onWebhookEvent });

      await adapter.handleWebhookEvent!(JSON.stringify({ type: "catalog_stock_updated", data: { foo: 1 } }), "sig");

      expect(onWebhookEvent).toHaveBeenCalledWith({ type: "other", rawType: "catalog_stock_updated", data: { foo: 1 } });
    });
  });

  describe("FulfillmentAdapter contract coverage", () => {
    it("passes the real compile-time type-compatibility proof (fulfillment-adapter-compat.ts) and exposes every required + the optional method at runtime", () => {
      const client = fakeClient();
      const adapter = assertPrintfulAdapterSatisfiesFulfillmentAdapter(baseConfig(client));

      expect(typeof adapter.submitOrder).toBe("function");
      expect(typeof adapter.getOrderStatus).toBe("function");
      expect(typeof adapter.handleWebhookEvent).toBe("function");
    });
  });
});
