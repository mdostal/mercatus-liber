/**
 * POST /api/demo/<demoSlug>/fulfillment/x3d/sync
 *
 * X3D Studios sends no webhooks, so something has to ask it for news. A
 * scheduler (a cron job, a GitHub Action) calls this route every few minutes
 * with `Authorization: Bearer <X3D_SYNC_SECRET>`. Each call reads the store's
 * open X3D orders and publishes `fulfillment.order.status_changed` for the
 * ones that changed.
 */
import { timingSafeEqual } from "node:crypto";

export interface SyncOutcome {
  status: number;
  body: { checked: number; published: number; failed: number } | { error: string };
}

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * 404 when X3D is not configured or no sync secret is set (the route then does
 * not exist as far as a caller can tell), 401 for a wrong secret. Failures to
 * read single orders are counted, not listed: the response is for a scheduler's log.
 */
export async function runX3dSync(poll: (() => Promise<{ checked: number; published: number; failed: unknown[] }>) | null, secret: string | undefined, authorization: string | null): Promise<SyncOutcome> {
  if (!poll || !secret) return { status: 404, body: { error: "not_configured" } };
  if (!bearerMatches(authorization, secret)) return { status: 401, body: { error: "unauthorized" } };
  const result = await poll();
  return { status: 200, body: { checked: result.checked, published: result.published, failed: result.failed.length } };
}
