/**
 * Real, table-backed WebhookSubscriptionStore/WebhookDeliveryLogStore
 * coverage (see this package's src/webhooks.ts) -- same "own local fake
 * Postgres Pool double" rule this package's other per-subsystem test files
 * follow (advertising.test.ts/fulfillment-routing.test.ts), not the shared
 * test/fake-pool.ts. No live Postgres server exists in this environment
 * (same disclosed gap test/fake-pool.ts's own header comment names) --
 * this proves the adapter's query-construction/row-mapping logic, not real
 * Postgres wire behavior.
 */
import type { WebhookDeliveryLogEntry, WebhookSubscription } from "@mercatus-liber/webhooks";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresWebhookDeliveryLogStore, createPostgresWebhookSubscriptionStore } from "../src/webhooks.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeWebhooksPool(): FakePool {
  const subscriptions = new Map<string, FakeRow>();
  const deliveries: FakeRow[] = [];

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      // --- webhook_subscriptions ---
      if (sql === "SELECT * FROM webhook_subscriptions WHERE id = $1") {
        const row = subscriptions.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM webhook_subscriptions WHERE active = $1") {
        return { rows: [...subscriptions.values()].filter((s) => s.active === values[0]) as T[] };
      }
      if (sql === "SELECT * FROM webhook_subscriptions") {
        return { rows: [...subscriptions.values()] as T[] };
      }
      if (sql.startsWith("INSERT INTO webhook_subscriptions")) {
        const [id, url, eventTypes, secret, active, createdAt] = values as [string, string, string, string, boolean, string];
        subscriptions.set(id, {
          id,
          url,
          // Real Postgres auto-parses a JSONB column back into a JS value for the driver -- mirrored here.
          event_types: JSON.parse(eventTypes),
          secret,
          active,
          created_at: createdAt,
        });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM webhook_subscriptions")) {
        subscriptions.delete(values[0] as string);
        return { rows: [] };
      }

      // --- webhook_deliveries ---
      if (sql === "SELECT * FROM webhook_deliveries WHERE subscription_id = $1 ORDER BY attempted_at ASC") {
        return {
          rows: deliveries
            .filter((d) => d.subscription_id === values[0])
            .sort((a, b) => String(a.attempted_at).localeCompare(String(b.attempted_at))) as T[],
        };
      }
      if (sql.startsWith("INSERT INTO webhook_deliveries")) {
        const [id, deliveryId, subscriptionId, eventType, attemptNumber, requestBody, responseStatus, status, error, attemptedAt] = values as [
          string,
          string,
          string,
          string,
          number,
          string,
          number | null,
          string,
          string | null,
          string,
        ];
        deliveries.push({
          id,
          delivery_id: deliveryId,
          subscription_id: subscriptionId,
          event_type: eventType,
          attempt_number: attemptNumber,
          request_body: requestBody,
          response_status: responseStatus,
          status,
          error,
          attempted_at: attemptedAt,
        });
        return { rows: [] };
      }

      throw new Error(`FakeWebhooksPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresWebhookSubscriptionStore", () => {
  let pool: FakePool;
  let store: ReturnType<typeof createPostgresWebhookSubscriptionStore>;

  beforeEach(() => {
    pool = createFakeWebhooksPool();
    store = createPostgresWebhookSubscriptionStore(pool as never);
  });

  const sub: WebhookSubscription = {
    id: "sub-1",
    url: "https://example.com/hook",
    eventTypes: ["checkout.order.placed", "checkout.order.paid"],
    secret: "a-secret",
    active: true,
    createdAt: "2026-10-18T00:00:00.000Z",
  };

  it("saves and retrieves a subscription by id, round-tripping multiple eventTypes", async () => {
    await store.save(sub);
    const found = await store.get("sub-1");
    expect(found).toEqual(sub);
  });

  it("returns null for a missing subscription", async () => {
    expect(await store.get("missing")).toBeNull();
  });

  it("list() with no filter returns everything", async () => {
    await store.save(sub);
    await store.save({ ...sub, id: "sub-2", eventTypes: ["cart.item.added"] });
    expect((await store.list()).map((s) => s.id).sort()).toEqual(["sub-1", "sub-2"]);
  });

  it("list({ active }) filters on the real active column", async () => {
    await store.save(sub);
    await store.save({ ...sub, id: "sub-2", active: false });
    expect(await store.list({ active: true })).toEqual([sub]);
    expect((await store.list({ active: false })).map((s) => s.id)).toEqual(["sub-2"]);
  });

  it("list({ eventType }) returns only subscriptions whose eventTypes include it", async () => {
    await store.save(sub); // ["checkout.order.placed", "checkout.order.paid"]
    await store.save({ ...sub, id: "sub-2", eventTypes: ["cart.item.added"] });
    expect((await store.list({ eventType: "checkout.order.paid" })).map((s) => s.id)).toEqual(["sub-1"]);
    expect((await store.list({ eventType: "cart.item.added" })).map((s) => s.id)).toEqual(["sub-2"]);
  });

  it("updates an existing subscription via resave (active true -> false)", async () => {
    await store.save(sub);
    await store.save({ ...sub, active: false });
    expect((await store.get("sub-1"))?.active).toBe(false);
    expect(await store.list()).toHaveLength(1);
  });

  it("delete removes the row", async () => {
    await store.save(sub);
    await store.delete("sub-1");
    expect(await store.get("sub-1")).toBeNull();
  });
});

describe("createPostgresWebhookDeliveryLogStore", () => {
  let pool: FakePool;
  let log: ReturnType<typeof createPostgresWebhookDeliveryLogStore>;

  beforeEach(() => {
    pool = createFakeWebhooksPool();
    log = createPostgresWebhookDeliveryLogStore(pool as never);
  });

  const entry: WebhookDeliveryLogEntry = {
    id: "log-1",
    deliveryId: "del-1",
    subscriptionId: "sub-1",
    eventType: "checkout.order.placed",
    attemptNumber: 1,
    requestBody: '{"eventType":"checkout.order.placed"}',
    responseStatus: 200,
    status: "success",
    error: null,
    attemptedAt: "2026-10-18T00:00:00.000Z",
  };

  it("records a delivery attempt and lists it back for its subscription", async () => {
    await log.record(entry);
    expect(await log.listForSubscription("sub-1")).toEqual([entry]);
  });

  it("returns an empty array for a subscription with no delivery history", async () => {
    expect(await log.listForSubscription("sub-none")).toEqual([]);
  });

  it("lists attempts in attempted-order, oldest first", async () => {
    await log.record({ ...entry, id: "log-2", attemptNumber: 2, attemptedAt: "2026-10-18T00:00:02.000Z", status: "failed", responseStatus: 500, error: "boom" });
    await log.record({ ...entry, id: "log-1", attemptNumber: 1, attemptedAt: "2026-10-18T00:00:01.000Z" });

    const found = await log.listForSubscription("sub-1");
    expect(found.map((e) => e.attemptNumber)).toEqual([1, 2]);
  });

  it("never mixes delivery history across different subscriptions", async () => {
    await log.record(entry);
    await log.record({ ...entry, id: "log-2", subscriptionId: "sub-2" });

    expect(await log.listForSubscription("sub-1")).toEqual([entry]);
    expect((await log.listForSubscription("sub-2")).map((e) => e.id)).toEqual(["log-2"]);
  });
});
