import { createInMemoryProviderCatalogMappingRepository, InvalidCatalogMappingError, MissingCatalogMappingError } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import type { PrintifyHttpClient } from "../src/http-client.js";
import { createPrintifyFulfillmentAdapter, printifyCatalogTargetsFrom, PRINTIFY_PROVIDER } from "../src/index.js";

const ORDER = { id: "po-1", status: "on-hold", line_items: [{ product_id: "p1", variant_id: 7, quantity: 1, external_id: "sku-1", status: "on-hold" }] };

function client(): PrintifyHttpClient & { sent: string[]; bodies: unknown[] } {
  const sent: string[] = [];
  const bodies: unknown[] = [];
  return {
    sent,
    bodies,
    async createOrder(body) {
      bodies.push(body);
      return { id: "po-1" };
    },
    async sendToProduction(id) {
      sent.push(id);
      return { ...ORDER, status: "sending-to-production" } as never;
    },
    async getOrder() {
      return ORDER as never;
    },
    async createWebhook() {
      return { id: "w", topic: "t", url: "u", shop_id: "s" };
    },
  };
}

async function mappedRepo() {
  const repo = createInMemoryProviderCatalogMappingRepository();
  await repo.save({ skuId: "sku-1", provider: PRINTIFY_PROVIDER, target: { productId: "p1", variantId: 7 } });
  return repo;
}

function adapter(http: PrintifyHttpClient, resolveCatalogTarget: (skuId: string) => Promise<{ productId: string; variantId: number }>, holdOrders?: boolean) {
  return createPrintifyFulfillmentAdapter({
    apiToken: "t",
    shopId: "s",
    httpClient: http,
    resolveCatalogTarget,
    resolveRecipient: async () => ({ first_name: "A", last_name: "B", email: "a@example.com", phone: "1", country: "US", region: "IL", address1: "1 Main", city: "C", zip: "60601" }),
    resolveExternalOrderId: async () => null,
    ...(holdOrders === undefined ? {} : { holdOrders }),
  });
}

describe("printifyCatalogTargetsFrom", () => {
  it("sends the stored product and variant", async () => {
    const http = client();
    await adapter(http, printifyCatalogTargetsFrom(await mappedRepo())).submitOrder({ orderId: "o1", items: [{ skuId: "sku-1", quantity: 1 }] });
    expect((http.bodies[0] as { line_items: { product_id: string; variant_id: number }[] }).line_items[0]).toMatchObject({ product_id: "p1", variant_id: 7 });
  });

  it("🔍 refuses an unmapped SKU before creating anything at Printify", async () => {
    const http = client();
    await expect(adapter(http, printifyCatalogTargetsFrom(await mappedRepo())).submitOrder({ orderId: "o1", items: [{ skuId: "other", quantity: 1 }] })).rejects.toThrow(MissingCatalogMappingError);
    expect(http.bodies).toEqual([]);
  });

  it("🔍 refuses a mapping that isn't a Printify product and integer variant", async () => {
    const repo = createInMemoryProviderCatalogMappingRepository();
    await repo.save({ skuId: "a", provider: PRINTIFY_PROVIDER, target: { productId: "p", variantId: "7" } });
    await repo.save({ skuId: "b", provider: PRINTIFY_PROVIDER, target: { variantId: 7 } });
    const resolve = printifyCatalogTargetsFrom(repo);
    await expect(resolve("a")).rejects.toThrow(InvalidCatalogMappingError);
    await expect(resolve("b")).rejects.toThrow(InvalidCatalogMappingError);
  });
});

describe("holdOrders", () => {
  it("🔍 leaves the order on hold, never sending it to production", async () => {
    const http = client();
    const records = await adapter(http, printifyCatalogTargetsFrom(await mappedRepo()), true).submitOrder({ orderId: "o1", items: [{ skuId: "sku-1", quantity: 1 }] });
    expect(http.sent).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]!.externalOrderId).toBe("po-1");
    expect(records[0]!.status).toBe("held");
  });

  it("still sends to production by default", async () => {
    const http = client();
    await adapter(http, printifyCatalogTargetsFrom(await mappedRepo())).submitOrder({ orderId: "o1", items: [{ skuId: "sku-1", quantity: 1 }] });
    expect(http.sent).toEqual(["po-1"]);
  });
});
