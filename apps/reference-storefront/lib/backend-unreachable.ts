import { MongoServerSelectionError } from "mongodb";

/**
 * free-tier-resilience-and-keepalive epic (fr-01): narrow, verified-shape
 * detector for "the free-tier backend itself is unreachable" -- see
 * .pHive/epics/free-tier-resilience-and-keepalive/docs/design-discussion.md
 * for the full incident record this epic is built from. Matches ONLY the
 * two real, live-confirmed shapes below; every other error (a real
 * application bug, a different database error, a plain TypeError) must
 * return false and keep propagating as a real error -- that is the actual
 * acceptance bar for this detector, not just "catch things."
 *
 * 1. Supabase's own Supavisor pooler error for a paused/deleted free
 *    project. Confirmed live via Vercel function logs (2026-10-15):
 *    `error: (ENOTFOUND) tenant/user postgres.dhjnancsmuteowfgfebx not
 *    found`. This is a real Postgres wire-protocol ErrorResponse, not a
 *    Node-level DNS/TCP error -- read node_modules/pg-protocol/dist/
 *    parser.js's own `parseErrorMessage`: the server's "C" field becomes
 *    the thrown `DatabaseError`'s `.code`, the "M" field becomes its
 *    `.message` verbatim (see node_modules/pg-protocol/dist/messages.js's
 *    `DatabaseError` class -- it's a plain `Error` subclass with those
 *    extra fields attached, not a dedicated per-error-kind class). Supavisor
 *    itself sets `.code` to the literal string `"ENOTFOUND"` (its own
 *    convention, not a real Postgres SQLSTATE) and a `.message` containing
 *    "tenant/user ... not found" when a paused/deleted project's pooler
 *    can't resolve which real Postgres instance to route a connection to.
 *    `packages/adapter-postgres`'s `createPostgresAdapter` runs its schema
 *    DDL -- and every query after it -- through this exact pool (see its
 *    own index.ts: `await pool.query(SCHEMA_SQL)` is the first real query
 *    issued), so this is the exact shape that surfaces the moment
 *    `apps/reference-storefront/lib/services.ts`'s `buildServices` first
 *    touches a dead pool.
 * 2. The MongoDB driver's own `MongoServerSelectionError` (real exported
 *    class, node_modules/mongodb/lib/error.js) -- thrown when no server can
 *    be selected before `serverSelectionTimeoutMS` elapses, i.e. the
 *    cluster itself is unreachable. Confirmed by direct research this
 *    session: a real `mongosh` attempt against this app's own
 *    `MONGODB_URL` hung the full 30s timeout with no response, consistent
 *    with an unreachable/paused Atlas cluster (not yet wired into a live
 *    demo today, per design-discussion.md's own scope note -- this branch
 *    exists so the detector is already correct the moment it is). Checked
 *    via `instanceof`, the most precise possible match: the driver exports
 *    this exact class for exactly this failure mode, so no message-
 *    substring guessing is needed the way the Postgres shape above requires.
 *
 * Deliberately NOT matched: any other Postgres error (a real syntax error,
 * constraint violation, missing table, etc. all carry a real Postgres
 * SQLSTATE `.code`, never the literal "ENOTFOUND"), a generic Node-level DNS
 * `ENOTFOUND` that doesn't mention a tenant (e.g. a genuinely unrelated
 * hostname typo elsewhere in the app), any other Mongo error class, and --
 * the critical bar for this detector -- a plain `Error`/`TypeError` thrown
 * from anywhere else in the app.
 */
export function isBackendUnreachableError(error: unknown): boolean {
  if (error instanceof MongoServerSelectionError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "ENOTFOUND") return false;
  const message = error.message.toLowerCase();
  return message.includes("tenant") && message.includes("not found");
}

/** Discriminated result of {@link readOrBackendUnreachable}. */
export type BackendReadResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Runs `load` -- the real catalog-persistence read path for one demo (e.g.
 * `getServicesForDemo` plus whatever a caller does with it, see
 * app/demo/[demoSlug]/layout.tsx, the one call site every `/demo/<slug>/*`
 * route shares) -- and narrowly catches ONLY `isBackendUnreachableError`
 * shapes, reporting `{ ok: false }` instead of letting the error crash the
 * page. Any other error -- a real bug -- rethrows completely unchanged, so
 * it keeps surfacing as a real error (Next's own default error handling),
 * never silently painted over as "the backend is just asleep." The real
 * error is still logged here (server-side only, never shown to the
 * visitor) so the operator keeps full diagnostic visibility.
 */
export async function readOrBackendUnreachable<T>(load: () => Promise<T>): Promise<BackendReadResult<T>> {
  try {
    const value = await load();
    return { ok: true, value };
  } catch (error) {
    if (!isBackendUnreachableError(error)) throw error;
    // eslint-disable-next-line no-console -- real operational signal (a free-tier backend is down); never shown to the visitor, who only sees BackendAsleepPage's honest copy.
    console.error("[backend-unreachable] catalog persistence backend is unreachable, rendering the asleep state:", error);
    return { ok: false };
  }
}
