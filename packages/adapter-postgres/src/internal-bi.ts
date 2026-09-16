import type { Pool } from "pg";
import type { BiEvent, BiEventLogRepository } from "@mercatus-liber/internal-bi";

/**
 * Table DDL for the BI event log -- self-contained here (not merged into
 * this package's shared schema.ts) because this file is one of many
 * concurrently-added, self-isolated adapter files; a later, sequential
 * story wires everyone's schema/exports together in schema.ts/index.ts
 * once. `payload` is an arbitrary JSON object (BiEvent's
 * Record<string, unknown>), so it maps to JSONB, same convention as every
 * other JSON-shaped column in this package (see categories.ts/schema.ts).
 */
const BI_EVENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bi_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bi_events_event_type ON bi_events(event_type);
`;

interface BiEventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>; // JSONB -- already parsed by the pg driver
}

function rowToBiEvent(row: BiEventRow): BiEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payload: row.payload,
  };
}

/**
 * Real Postgres-backed BiEventLogRepository -- the raw event log backing
 * the conversion funnel (@mercatus-liber/internal-bi's
 * createInMemoryBiEventLogRepository is the in-memory reference this
 * mirrors). append-only, matching the in-memory reference exactly: an
 * event's id is never reused/updated once appended, so a plain INSERT is
 * correct -- no ON CONFLICT/upsert clause, unlike this package's other
 * save() methods. list() returns every recorded event in insertion order,
 * matching the in-memory reference (a plain array push). The given DDL has
 * no serial/auto-increment column to sort by, so list() orders by `ctid`
 * -- for an append-only heap table (no UPDATE/DELETE ever issued against
 * this table), Postgres's physical row order is insertion order, which
 * `ctid` exposes without needing to add a column beyond the fixed schema.
 *
 * Runs its own DDL on construction (async, awaited before the repository
 * is usable) rather than relying on this package's central schema.ts --
 * deliberate, per the file-isolation constraint this file was added under.
 */
export async function createPostgresBiEventLogRepository(pool: Pool): Promise<BiEventLogRepository> {
  await pool.query(BI_EVENTS_SCHEMA_SQL);

  return {
    async append(event: BiEvent): Promise<void> {
      await pool.query(
        `INSERT INTO bi_events (id, event_type, occurred_at, payload)
         VALUES ($1, $2, $3, $4)`,
        [event.id, event.eventType, event.occurredAt, JSON.stringify(event.payload)],
      );
    },
    async list(): Promise<BiEvent[]> {
      const result = await pool.query<BiEventRow>("SELECT * FROM bi_events ORDER BY ctid");
      return result.rows.map(rowToBiEvent);
    },
  };
}
