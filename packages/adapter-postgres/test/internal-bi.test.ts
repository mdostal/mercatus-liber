/**
 * Real, table-backed BiEventLogRepository coverage (see this package's
 * src/internal-bi.ts) -- the conversion funnel's raw event log was
 * in-memory-only, always, until now (see
 * @mercatus-liber/internal-bi's createInMemoryBiEventLogRepository).
 *
 * Deliberately does NOT import the shared test/fake-pool.ts double -- this
 * file (like src/internal-bi.ts) was added in isolation while many other
 * agents concurrently add their own self-contained files to this same
 * package, so it carries its own minimal fake `pg.Pool` double, scoped to
 * exactly the bi_events statements src/internal-bi.ts issues.
 */
import type { BiEvent } from "@mercatus-liber/internal-bi";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresBiEventLogRepository } from "../src/internal-bi.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Minimal local fake Postgres Pool double -- NOT a real Postgres
 * connection. Recognizes exactly the fixed set of SQL statements
 * src/internal-bi.ts issues and serves them from an in-memory array (append
 * order preserved, mirroring how a real append-only heap table's physical
 * `ctid` order -- what src/internal-bi.ts's list() sorts by -- matches
 * insertion order when no row is ever updated or deleted).
 */
function createFakeBiEventPool(): FakePool {
  const rows: FakeRow[] = [];

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql.startsWith("INSERT INTO bi_events")) {
        const [id, eventType, occurredAt, payload] = values as [string, string, string, string];
        // Real behavior: id TEXT PRIMARY KEY (see the DDL), and this is a
        // plain INSERT with no ON CONFLICT clause -- a duplicate id is a
        // real unique-violation error, not a silent upsert, mirrored here.
        if (rows.some((row) => row.id === id)) {
          throw new Error(`duplicate key value violates unique constraint "bi_events_pkey"`);
        }
        rows.push({
          id,
          event_type: eventType,
          occurred_at: occurredAt,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here.
          payload: JSON.parse(payload),
        });
        return { rows: [] };
      }

      if (sql === "SELECT * FROM bi_events ORDER BY ctid") {
        return { rows: [...rows] as T[] };
      }

      throw new Error(`FakeBiEventPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresBiEventLogRepository", () => {
  let pool: FakePool;
  let eventLog: Awaited<ReturnType<typeof createPostgresBiEventLogRepository>>;

  beforeEach(async () => {
    pool = createFakeBiEventPool();
    eventLog = await createPostgresBiEventLogRepository(pool as never);
  });

  const event1: BiEvent = {
    id: "evt-1",
    eventType: "cart.item.added",
    occurredAt: "2026-01-01T10:00:00.000Z",
    payload: { skuId: "sku-1", quantity: 2 },
  };
  const event2: BiEvent = {
    id: "evt-2",
    eventType: "checkout.order.paid",
    occurredAt: "2026-01-01T11:00:00.000Z",
    payload: { orderId: "order-1" },
  };
  const event3: BiEvent = {
    id: "evt-3",
    eventType: "cart.item.added",
    occurredAt: "2026-01-01T12:00:00.000Z",
    payload: { skuId: "sku-2", quantity: 1 },
  };

  it("starts empty", async () => {
    expect(await eventLog.list()).toEqual([]);
  });

  it("appends and round-trips a single event exactly", async () => {
    await eventLog.append(event1);
    expect(await eventLog.list()).toEqual([event1]);
  });

  it("append+list round-trips multiple events, returning every one", async () => {
    await eventLog.append(event1);
    await eventLog.append(event2);
    await eventLog.append(event3);

    const found = await eventLog.list();
    expect(found).toHaveLength(3);
    expect(found).toEqual(expect.arrayContaining([event1, event2, event3]));
  });

  it("list() returns events in insertion order, matching the in-memory reference", async () => {
    await eventLog.append(event3);
    await eventLog.append(event1);
    await eventLog.append(event2);

    const found = await eventLog.list();
    expect(found.map((e) => e.id)).toEqual(["evt-3", "evt-1", "evt-2"]);
  });

  it("round-trips a real payload object with nested fields exactly through JSONB", async () => {
    const nested: BiEvent = {
      id: "evt-nested",
      eventType: "promotions.redeemed",
      occurredAt: "2026-01-01T13:00:00.000Z",
      payload: {
        promotionId: "promo-1",
        code: "SAVE10",
        order: { id: "order-9", items: [{ skuId: "sku-1", quantity: 3 }] },
        tags: ["seasonal", "vip"],
        discount: { amount: 500, currency: "USD" },
        redeemedAt: null,
      },
    };

    await eventLog.append(nested);
    const [found] = await eventLog.list();

    expect(found).toEqual(nested);
    expect(found!.payload).toEqual(nested.payload);
  });

  it("append is a plain insert, not an upsert -- re-appending an existing id rejects and leaves the original event untouched", async () => {
    await eventLog.append(event1);
    await expect(eventLog.append({ ...event1, payload: { mutated: true } })).rejects.toThrow();

    const found = await eventLog.list();
    expect(found).toEqual([event1]);
  });
});
