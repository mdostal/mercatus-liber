import type {
  AccountingSyncAdapter,
  AccountingSyncProviderKey,
  AccountingSyncRecord,
  AccountingSyncRepository,
  OrderLookup,
} from "./types.js";
import { OrderNotFoundForAccountingSyncError } from "./types.js";

export interface AccountingSyncService {
  /**
   * Idempotent: if `orderId` already has a `"synced"` record, returns it
   * unchanged without calling the adapter again -- a redelivered
   * `checkout.order.paid` event (the in-process EventBus is documented
   * at-least-once, see `@mercatus-liber/core`'s `createInMemoryEventBus`)
   * or a manual admin re-trigger must never double-book the same order in
   * the real accounting system. A prior `"failed"` record IS retried (the
   * whole point of being able to see it failed is to be able to fix the
   * cause and try again).
   *
   * Never throws -- a failed sync is recorded (status `"failed"`, the real
   * error message) and returned, not rethrown. See `registerAccountingSync`
   * (subscriber.ts) for why this matters: a broken/misconfigured accounting
   * adapter must never be able to blow up the `checkout.order.paid` event
   * chain for every other subscriber on it (inventory, internal-bi, etc.).
   * A direct caller (e.g. an admin "retry sync" button) that wants to know
   * whether THIS call actually succeeded reads `.status` on the returned
   * record.
   */
  syncOrder(orderId: string): Promise<AccountingSyncRecord>;
  getSyncRecord(orderId: string): Promise<AccountingSyncRecord | null>;
  listSyncRecords(): Promise<AccountingSyncRecord[]>;
}

export function createAccountingSyncService(deps: {
  orders: OrderLookup;
  adapter: AccountingSyncAdapter;
  repository: AccountingSyncRepository;
  /** The provider key stamped onto every record this service saves, e.g. `"quickbooks"` (see `@mercatus-liber/adapter-quickbooks`'s `QUICKBOOKS_PROVIDER`). */
  provider: AccountingSyncProviderKey;
}): AccountingSyncService {
  const { orders, adapter, repository, provider } = deps;

  return {
    async syncOrder(orderId: string): Promise<AccountingSyncRecord> {
      const existing = await repository.get(orderId);
      if (existing && existing.status === "synced") return existing;

      const order = await orders.getOrder(orderId);
      if (!order) throw new OrderNotFoundForAccountingSyncError(orderId);

      try {
        const result = await adapter.syncOrder(order);
        const record: AccountingSyncRecord = {
          orderId,
          provider,
          status: "synced",
          externalId: result.externalId,
          syncedAt: result.syncedAt,
          error: null,
        };
        await repository.save(record);
        return record;
      } catch (err) {
        const record: AccountingSyncRecord = {
          orderId,
          provider,
          status: "failed",
          externalId: null,
          syncedAt: null,
          error: err instanceof Error ? err.message : String(err),
        };
        await repository.save(record);
        return record;
      }
    },

    async getSyncRecord(orderId: string): Promise<AccountingSyncRecord | null> {
      return repository.get(orderId);
    },

    async listSyncRecords(): Promise<AccountingSyncRecord[]> {
      return repository.list();
    },
  };
}
