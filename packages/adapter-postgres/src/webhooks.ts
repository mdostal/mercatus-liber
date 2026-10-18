import type { Pool } from "pg";
import type { WebhookDeliveryLogEntry, WebhookDeliveryLogStore, WebhookDeliveryStatus, WebhookSubscription, WebhookSubscriptionStore } from "@mercatus-liber/webhooks";

/**
 * Self-contained DDL for this file's two tables -- same "own schema-init, no
 * shared-file edits" pattern this package's fulfillment-routing.ts/
 * advertising.ts already established (not added to schema.ts). Run on
 * construction, idempotent (IF NOT EXISTS), so each factory alone is enough
 * to make its own table(s) exist. `event_types` (string[]) maps to JSONB,
 * matching this package's existing JSONB-for-structured-fields convention
 * (see advertising.ts's `targeting`/`creatives`); `webhook_deliveries` has no
 * foreign key onto `webhook_subscriptions` on purpose -- a delivery log row
 * is a historical fact that should survive a subscription row being deleted
 * (debugging "why did deliveries to a now-deleted subscription stop"), so a
 * hard FK with ON DELETE CASCADE would destroy exactly the audit trail this
 * table exists to keep.
 */
const WEBHOOKS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  event_types JSONB NOT NULL,
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  request_body TEXT NOT NULL,
  response_status INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription_id ON webhook_deliveries(subscription_id);
`;

interface WebhookSubscriptionRow {
  id: string;
  url: string;
  event_types: string[]; // JSONB -- already parsed by the pg driver
  secret: string;
  active: boolean;
  created_at: string;
}

function rowToSubscription(row: WebhookSubscriptionRow): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    eventTypes: row.event_types,
    secret: row.secret,
    active: row.active,
    createdAt: row.created_at,
  };
}

/**
 * Real Postgres-backed WebhookSubscriptionStore -- mirrors
 * @mercatus-liber/webhooks' own in-memory reference
 * (createInMemoryWebhookSubscriptionStore) exactly: get/list return plain
 * values (no mutable reference back into storage, same intent as the
 * in-memory adapter's structuredClone), save is a full upsert keyed by id,
 * list's `eventType`/`active` filters are additive (both/either/neither may
 * be supplied).
 */
export function createPostgresWebhookSubscriptionStore(pool: Pool): WebhookSubscriptionStore {
  const ready = pool.query(WEBHOOKS_SCHEMA_SQL).then(() => undefined);

  return {
    async get(id: string): Promise<WebhookSubscription | null> {
      await ready;
      const result = await pool.query<WebhookSubscriptionRow>("SELECT * FROM webhook_subscriptions WHERE id = $1", [id]);
      return result.rows[0] ? rowToSubscription(result.rows[0]) : null;
    },
    async list(filter?: { eventType?: string; active?: boolean }): Promise<WebhookSubscription[]> {
      await ready;
      // `active` is a real plain-column filter pushed into SQL (same shape
      // as advertising.ts's demo_slug filter). `eventTypes` is a JSONB array
      // column -- rather than lean on a JSONB containment operator (`@>`)
      // whose exact index-ability/behavior isn't this story's concern to
      // re-verify, this filters in JS after the fetch, same posture as this
      // package's own in-memory reference (createInMemoryWebhookSubscriptionStore)
      // and simpler to keep correct across both real Postgres and this
      // package's own test fake-pool doubles.
      const result =
        filter?.active !== undefined
          ? await pool.query<WebhookSubscriptionRow>("SELECT * FROM webhook_subscriptions WHERE active = $1", [filter.active])
          : await pool.query<WebhookSubscriptionRow>("SELECT * FROM webhook_subscriptions");
      const subscriptions = result.rows.map(rowToSubscription);
      return filter?.eventType ? subscriptions.filter((subscription) => subscription.eventTypes.includes(filter.eventType as string)) : subscriptions;
    },
    async save(subscription: WebhookSubscription): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO webhook_subscriptions (id, url, event_types, secret, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           url = EXCLUDED.url,
           event_types = EXCLUDED.event_types,
           secret = EXCLUDED.secret,
           active = EXCLUDED.active,
           created_at = EXCLUDED.created_at`,
        [subscription.id, subscription.url, JSON.stringify(subscription.eventTypes), subscription.secret, subscription.active, subscription.createdAt],
      );
    },
    async delete(id: string): Promise<void> {
      await ready;
      await pool.query("DELETE FROM webhook_subscriptions WHERE id = $1", [id]);
    },
  };
}

interface WebhookDeliveryRow {
  id: string;
  delivery_id: string;
  subscription_id: string;
  event_type: string;
  attempt_number: number;
  request_body: string;
  response_status: number | null;
  status: string;
  error: string | null;
  attempted_at: string;
}

function rowToDeliveryEntry(row: WebhookDeliveryRow): WebhookDeliveryLogEntry {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    subscriptionId: row.subscription_id,
    eventType: row.event_type,
    attemptNumber: row.attempt_number,
    requestBody: row.request_body,
    responseStatus: row.response_status,
    status: row.status as WebhookDeliveryStatus,
    error: row.error,
    attemptedAt: row.attempted_at,
  };
}

/**
 * Real Postgres-backed WebhookDeliveryLogStore -- append-only (no
 * update/delete method exists on the interface, matching
 * @mercatus-liber/webhooks' own in-memory reference). `listForSubscription`
 * orders by `attempted_at` so a retry sequence reads back in the order it
 * actually happened, the same guarantee the in-memory store gets for free
 * from array insertion order.
 */
export function createPostgresWebhookDeliveryLogStore(pool: Pool): WebhookDeliveryLogStore {
  const ready = pool.query(WEBHOOKS_SCHEMA_SQL).then(() => undefined);

  return {
    async record(entry: WebhookDeliveryLogEntry): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO webhook_deliveries (id, delivery_id, subscription_id, event_type, attempt_number, request_body, response_status, status, error, attempted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.id,
          entry.deliveryId,
          entry.subscriptionId,
          entry.eventType,
          entry.attemptNumber,
          entry.requestBody,
          entry.responseStatus,
          entry.status,
          entry.error,
          entry.attemptedAt,
        ],
      );
    },
    async listForSubscription(subscriptionId: string): Promise<WebhookDeliveryLogEntry[]> {
      await ready;
      const result = await pool.query<WebhookDeliveryRow>(
        "SELECT * FROM webhook_deliveries WHERE subscription_id = $1 ORDER BY attempted_at ASC",
        [subscriptionId],
      );
      return result.rows.map(rowToDeliveryEntry);
    },
  };
}
