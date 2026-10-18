import type { AccountingSyncRecord, AccountingSyncRepository } from "./types.js";

/**
 * Default in-memory AccountingSyncRepository -- structured exactly like
 * every other in-memory repository in this project (structuredClone in/out
 * so callers can never mutate stored state through a returned reference,
 * see e.g. `@mercatus-liber/internal-bi`'s `createInMemoryBiEventLogRepository`).
 * Keyed by `orderId` alone: this reference implementation only ever syncs a
 * given order to one provider at a time in practice (see service.ts's
 * `createAccountingSyncService`, which is constructed with exactly one
 * adapter), so one record per order is the real, current shape; a
 * deployment running two providers side by side would need a repository
 * keyed by `${orderId}:${provider}` instead -- not built here since nothing
 * in this repo does that yet (mirrors this codebase's own "don't build for
 * a need that doesn't exist yet" discipline).
 */
export function createInMemoryAccountingSyncRepository(): AccountingSyncRepository {
  const recordsByOrderId = new Map<string, AccountingSyncRecord>();

  return {
    async get(orderId: string): Promise<AccountingSyncRecord | null> {
      const record = recordsByOrderId.get(orderId);
      return record ? structuredClone(record) : null;
    },
    async save(record: AccountingSyncRecord): Promise<void> {
      recordsByOrderId.set(record.orderId, structuredClone(record));
    },
    async list(): Promise<AccountingSyncRecord[]> {
      return [...recordsByOrderId.values()].map((record) => structuredClone(record));
    },
  };
}
