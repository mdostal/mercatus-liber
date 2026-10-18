import { createInMemoryEventBus, type EventBus, type Money } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAccountingSyncRepository } from "../src/in-memory-repository.js";
import { createAccountingSyncService } from "../src/service.js";
import { registerAccountingSync } from "../src/subscriber.js";
import {
  OrderNotFoundForAccountingSyncError,
  type AccountingSyncAdapter,
  type OrderLookup,
  type SyncableOrder,
} from "../src/types.js";

const USD = (amount: number): Money => ({ amount, currency: "USD" });

function fakeOrders(orders: SyncableOrder[]): OrderLookup {
  return {
    async getOrder(id) {
      return orders.find((o) => o.id === id) ?? null;
    },
  };
}

const baseOrder: SyncableOrder = {
  id: "order-1",
  customerId: "cust-1",
  items: [{ skuId: "sku-1", quantity: 2, priceAtPurchase: USD(1000) }],
  discountTotal: USD(0),
  appliedPromotionCode: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  shippingInfo: { name: "Ada Lovelace", email: "ada@example.com" },
};

describe("createAccountingSyncService", () => {
  describe("syncOrder", () => {
    it("calls the adapter with the real order and saves a 'synced' record carrying the adapter's externalId/syncedAt", async () => {
      const adapter: AccountingSyncAdapter = {
        syncOrder: vi.fn(async (order: SyncableOrder) => {
          expect(order).toEqual(baseOrder);
          return { externalId: "qbo-sr-123", syncedAt: "2026-10-18T01:00:00.000Z" };
        }),
      };
      const repository = createInMemoryAccountingSyncRepository();
      const service = createAccountingSyncService({
        orders: fakeOrders([baseOrder]),
        adapter,
        repository,
        provider: "quickbooks",
      });

      const record = await service.syncOrder("order-1");

      expect(record).toEqual({
        orderId: "order-1",
        provider: "quickbooks",
        status: "synced",
        externalId: "qbo-sr-123",
        syncedAt: "2026-10-18T01:00:00.000Z",
        error: null,
      });
      expect(await repository.get("order-1")).toEqual(record);
      expect(adapter.syncOrder).toHaveBeenCalledTimes(1);
    });

    it("is idempotent: a second syncOrder call for an already-'synced' order returns the existing record without calling the adapter again", async () => {
      const adapter: AccountingSyncAdapter = {
        syncOrder: vi.fn(async () => ({ externalId: "qbo-sr-123", syncedAt: "2026-10-18T01:00:00.000Z" })),
      };
      const service = createAccountingSyncService({
        orders: fakeOrders([baseOrder]),
        adapter,
        repository: createInMemoryAccountingSyncRepository(),
        provider: "quickbooks",
      });

      const first = await service.syncOrder("order-1");
      const second = await service.syncOrder("order-1");

      expect(second).toEqual(first);
      expect(adapter.syncOrder).toHaveBeenCalledTimes(1);
    });

    it("never throws when the adapter rejects -- records a 'failed' record with the real error message instead", async () => {
      const adapter: AccountingSyncAdapter = {
        syncOrder: vi.fn(async () => {
          throw new Error("QuickBooks API error: POST /v3/company/123/salesreceipt -> HTTP 401");
        }),
      };
      const repository = createInMemoryAccountingSyncRepository();
      const service = createAccountingSyncService({
        orders: fakeOrders([baseOrder]),
        adapter,
        repository,
        provider: "quickbooks",
      });

      const record = await service.syncOrder("order-1");

      expect(record).toEqual({
        orderId: "order-1",
        provider: "quickbooks",
        status: "failed",
        externalId: null,
        syncedAt: null,
        error: "QuickBooks API error: POST /v3/company/123/salesreceipt -> HTTP 401",
      });
      expect(await repository.get("order-1")).toEqual(record);
    });

    it("retries a prior 'failed' sync (unlike an already-'synced' one) -- a fixed adapter can succeed on the next call", async () => {
      let shouldFail = true;
      const adapter: AccountingSyncAdapter = {
        async syncOrder() {
          if (shouldFail) throw new Error("transient failure");
          return { externalId: "qbo-sr-999", syncedAt: "2026-10-18T02:00:00.000Z" };
        },
      };
      const service = createAccountingSyncService({
        orders: fakeOrders([baseOrder]),
        adapter,
        repository: createInMemoryAccountingSyncRepository(),
        provider: "quickbooks",
      });

      const failed = await service.syncOrder("order-1");
      expect(failed.status).toBe("failed");

      shouldFail = false;
      const synced = await service.syncOrder("order-1");
      expect(synced).toEqual({
        orderId: "order-1",
        provider: "quickbooks",
        status: "synced",
        externalId: "qbo-sr-999",
        syncedAt: "2026-10-18T02:00:00.000Z",
        error: null,
      });
    });

    it("throws OrderNotFoundForAccountingSyncError for an unknown orderId -- a genuine caller error, distinct from an adapter failure", async () => {
      const service = createAccountingSyncService({
        orders: fakeOrders([]),
        adapter: { syncOrder: vi.fn() },
        repository: createInMemoryAccountingSyncRepository(),
        provider: "quickbooks",
      });

      await expect(service.syncOrder("no-such-order")).rejects.toThrow(OrderNotFoundForAccountingSyncError);
    });
  });

  describe("getSyncRecord / listSyncRecords", () => {
    it("delegate directly to the repository", async () => {
      const repository = createInMemoryAccountingSyncRepository();
      const service = createAccountingSyncService({
        orders: fakeOrders([baseOrder]),
        adapter: { syncOrder: async () => ({ externalId: "qbo-1", syncedAt: "2026-10-18T00:00:00.000Z" }) },
        repository,
        provider: "quickbooks",
      });

      expect(await service.getSyncRecord("order-1")).toBeNull();
      await service.syncOrder("order-1");
      expect(await service.getSyncRecord("order-1")).not.toBeNull();
      expect(await service.listSyncRecords()).toHaveLength(1);
    });
  });
});

describe("registerAccountingSync", () => {
  let events: EventBus;

  beforeEach(() => {
    events = createInMemoryEventBus();
  });

  it("dispatches a sync when checkout.order.paid fires, without blocking the publish() call on the adapter's own latency", async () => {
    let resolveAdapterCall!: () => void;
    const adapterCallStarted = new Promise<void>((resolve) => {
      resolveAdapterCall = resolve;
    });
    let adapterCallFinished = false;

    const adapter: AccountingSyncAdapter = {
      async syncOrder() {
        resolveAdapterCall();
        // Simulate real outbound HTTP latency -- never resolved before
        // publish() below returns, proving this subscriber is genuinely
        // fire-and-forget rather than secretly awaiting the adapter.
        await new Promise((r) => setTimeout(r, 20));
        adapterCallFinished = true;
        return { externalId: "qbo-1", syncedAt: "2026-10-18T00:00:00.000Z" };
      },
    };
    const repository = createInMemoryAccountingSyncRepository();
    const sync = createAccountingSyncService({
      orders: fakeOrders([baseOrder]),
      adapter,
      repository,
      provider: "quickbooks",
    });
    registerAccountingSync({ events, sync });

    await events.publish("checkout.order.paid", { orderId: "order-1" });

    // publish() resolved already; the adapter's own (slower) call may not
    // have finished yet -- that's the whole point of not awaiting it inline.
    expect(adapterCallFinished).toBe(false);

    await adapterCallStarted;
    // Wait for the real background sync to actually complete before asserting on it.
    await new Promise((r) => setTimeout(r, 30));
    expect(adapterCallFinished).toBe(true);
    expect(await repository.get("order-1")).toMatchObject({ status: "synced", externalId: "qbo-1" });
  });

  it("logs rather than crashing when syncOrder rejects for a real reason (e.g. an unknown orderId)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sync = createAccountingSyncService({
      orders: fakeOrders([]), // order-1 does not exist
      adapter: { syncOrder: vi.fn() },
      repository: createInMemoryAccountingSyncRepository(),
      provider: "quickbooks",
    });
    registerAccountingSync({ events, sync });

    await events.publish("checkout.order.paid", { orderId: "order-1" });
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
