import type { AccountingSyncRecord, SyncableOrder } from "@mercatus-liber/accounting-sync";
import { createAccountingSyncService, createInMemoryAccountingSyncRepository } from "@mercatus-liber/accounting-sync";
import type { Money } from "@mercatus-liber/core";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertQuickBooksAdapterSatisfiesAccountingSyncAdapter } from "../src/accounting-sync-adapter-compat.js";
import type { QuickBooksHttpClient } from "../src/http-client.js";
import { createQuickBooksAccountingSyncAdapter, QUICKBOOKS_PROVIDER, type QuickBooksAccountingSyncAdapterConfig } from "../src/index.js";
import { moneyToDecimal } from "../src/mapping.js";
import { QuickBooksWebhookSignatureInvalidError, QuickBooksWebhookVerifierNotConfiguredError, verifyQuickBooksSignature } from "../src/webhook.js";

const USD = (amount: number): Money => ({ amount, currency: "USD" });

/**
 * Every response fixture below is shaped exactly like QuickBooks Online's
 * real, documented v3 Accounting API create response confirmed during this
 * story's research (see quickbooks-types.ts's top doc comment) -- not
 * invented. No live QuickBooks account/credentials exist in this
 * environment (same disclosed gap as adapter-printful/-printify's own
 * "Real credential gate").
 */
function fakeClient(overrides: Partial<QuickBooksHttpClient> = {}): QuickBooksHttpClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async createSalesEntity(recordType, body) {
      calls.push([recordType, body]);
      if (overrides.createSalesEntity) return overrides.createSalesEntity(recordType, body);
      return { Id: "555", SyncToken: "0", DocNumber: body.DocNumber };
    },
  };
}

const order: SyncableOrder = {
  id: "order-1",
  customerId: "cust-1",
  items: [
    { skuId: "sku-mug", quantity: 2, priceAtPurchase: USD(1000) },
    { skuId: "sku-shirt", quantity: 1, priceAtPurchase: USD(2500) },
  ],
  discountTotal: USD(0),
  appliedPromotionCode: null,
  createdAt: "2026-10-18T12:34:56.000Z",
  shippingInfo: { name: "Ada Lovelace", email: "ada@example.com" },
};

function baseConfig(client: QuickBooksHttpClient): QuickBooksAccountingSyncAdapterConfig {
  return {
    realmId: "9999",
    httpClient: client,
    async resolveCustomer() {
      return { customerId: "qbo-cust-42" };
    },
    async resolveItem(skuId: string) {
      return { itemId: skuId === "sku-mug" ? "7" : "8" };
    },
  };
}

describe("createQuickBooksAccountingSyncAdapter", () => {
  describe("syncOrder", () => {
    it("defaults to creating a SalesReceipt (the order is already paid in full) with the real, confirmed request shape", async () => {
      const client = fakeClient();
      const adapter = createQuickBooksAccountingSyncAdapter(baseConfig(client));

      const result = await adapter.syncOrder(order);

      expect(client.calls).toHaveLength(1);
      expect(client.calls[0]![0]).toBe("SalesReceipt");
      expect(client.calls[0]![1]).toEqual({
        CustomerRef: { value: "qbo-cust-42", name: "Ada Lovelace" },
        Line: [
          { Amount: 20, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "7" }, Qty: 2, UnitPrice: 10 } },
          { Amount: 25, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "8" }, Qty: 1, UnitPrice: 25 } },
        ],
        DocNumber: "order-1",
        TxnDate: "2026-10-18",
      });
      expect(result.externalId).toBe("555");
      expect(typeof result.syncedAt).toBe("string");
    });

    it("creates an Invoice instead when recordType is configured to 'Invoice'", async () => {
      const client = fakeClient();
      const adapter = createQuickBooksAccountingSyncAdapter({ ...baseConfig(client), recordType: "Invoice" });

      await adapter.syncOrder(order);

      expect(client.calls[0]![0]).toBe("Invoice");
    });

    it("converts cents (this repo's Money) to QBO's real decimal UnitPrice/Amount fields", () => {
      expect(moneyToDecimal(USD(1000))).toBe(10);
      expect(moneyToDecimal(USD(999))).toBe(9.99);
      expect(moneyToDecimal(USD(1))).toBe(0.01);
    });

    it("end to end with @mercatus-liber/accounting-sync's own createAccountingSyncService: a successful syncOrder saves a 'synced' record with this adapter's real externalId", async () => {
      const client = fakeClient({ createSalesEntity: async () => ({ Id: "777", SyncToken: "0" }) });
      const adapter = createQuickBooksAccountingSyncAdapter(baseConfig(client));
      const repository = createInMemoryAccountingSyncRepository();
      const service = createAccountingSyncService({
        orders: { async getOrder(id) { return id === order.id ? order : null; } },
        adapter,
        repository,
        provider: QUICKBOOKS_PROVIDER,
      });

      const record: AccountingSyncRecord = await service.syncOrder("order-1");

      expect(record.status).toBe("synced");
      expect(record.provider).toBe("quickbooks");
      expect(record.externalId).toBe("777");
    });
  });

  describe("handleWebhookEvent", () => {
    it("fails closed with QuickBooksWebhookVerifierNotConfiguredError when no verifier is configured", async () => {
      const client = fakeClient();
      const adapter = createQuickBooksAccountingSyncAdapter(baseConfig(client));

      await expect(adapter.handleWebhookEvent!(JSON.stringify({ eventNotifications: [] }), "sig")).rejects.toThrow(
        QuickBooksWebhookVerifierNotConfiguredError,
      );
    });

    it("verifies using the real HMAC-SHA256 intuit-signature scheme when webhookVerifierToken is configured, throwing on a mismatch", async () => {
      const client = fakeClient();
      const verifierToken = "real-verifier-token";
      const adapter = createQuickBooksAccountingSyncAdapter({ ...baseConfig(client), webhookVerifierToken: verifierToken });

      const rawBody = JSON.stringify({
        eventNotifications: [{ realmId: "9999", dataChangeEvent: { entities: [{ name: "SalesReceipt", id: "555", operation: "Update", lastUpdated: "2026-10-18T00:00:00Z" }] } }],
      });
      const realSignature = createHmac("sha256", verifierToken).update(rawBody).digest("base64");

      await expect(adapter.handleWebhookEvent!(rawBody, realSignature)).resolves.toBeUndefined();
      await expect(adapter.handleWebhookEvent!(rawBody, "not-the-real-signature-base64")).rejects.toThrow(QuickBooksWebhookSignatureInvalidError);
    });

    it("verifyQuickBooksSignature standalone: matches Node's own HMAC-SHA256/base64 output exactly", () => {
      const verifierToken = "token-abc";
      const rawBody = "exact raw body bytes";
      const expected = createHmac("sha256", verifierToken).update(rawBody).digest("base64");

      expect(verifyQuickBooksSignature(verifierToken, rawBody, expected)).toBe(true);
      expect(verifyQuickBooksSignature(verifierToken, rawBody, Buffer.from("wrong").toString("base64"))).toBe(false);
    });

    it("honors a custom verifyWebhookSignature override and invokes onWebhookEvent with the parsed payload", async () => {
      const client = fakeClient();
      const onWebhookEvent = vi.fn();
      const adapter = createQuickBooksAccountingSyncAdapter({
        ...baseConfig(client),
        verifyWebhookSignature: async () => true,
        onWebhookEvent,
      });

      const payload = { eventNotifications: [{ realmId: "9999", dataChangeEvent: { entities: [{ name: "SalesReceipt", id: "555", operation: "Void", lastUpdated: "2026-10-18T00:00:00Z" }] } }] };
      await adapter.handleWebhookEvent!(JSON.stringify(payload), "whatever-sig");

      expect(onWebhookEvent).toHaveBeenCalledWith(payload);
    });
  });

  describe("AccountingSyncAdapter contract coverage", () => {
    it("passes the real compile-time type-compatibility proof and exposes every required + optional method at runtime", () => {
      const client = fakeClient();
      const adapter = assertQuickBooksAdapterSatisfiesAccountingSyncAdapter(baseConfig(client));

      expect(typeof adapter.syncOrder).toBe("function");
      expect(typeof adapter.handleWebhookEvent).toBe("function");
    });
  });
});
