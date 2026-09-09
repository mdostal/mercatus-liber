import type { AdminAuthAdapter, AdminRole, AdminSession } from "./types.js";

/** Name of the session cookie the dev default checks for. The host app is responsible for actually setting/clearing this cookie on its dev sign-in/sign-out routes -- this package only ever reads its value. */
export const ADMIN_DEV_SESSION_COOKIE = "ml_admin_dev_session";

const DEV_OWNER_USER_ID = "dev-owner";
const DEV_OWNER_EMAIL = "dev-owner@localhost";
const DEV_OWNER_ROLE: AdminRole = "owner";

/**
 * Compares `password` against `process.env.ADMIN_DEV_PASSWORD`. Returns
 * false whenever the env var is unset or empty, regardless of what is
 * passed in -- an unset password can never "match" an empty string.
 */
export function verifyDevPassword(password: string): boolean {
  const expected = process.env.ADMIN_DEV_PASSWORD;
  if (!expected) return false;
  return password === expected;
}

/**
 * Zero-infra, LOCAL-DEVELOPMENT-ONLY default implementation of
 * AdminAuthAdapter, for running this repo without a Clerk account.
 *
 * ============================================================================
 * NOT A PRODUCTION SECURITY BOUNDARY. Do not deploy this adapter anywhere
 * a real user could reach it. There is no per-user session store, no
 * expiry, no CSRF protection, and no rate limiting on the password check --
 * it is a single shared ADMIN_DEV_PASSWORD gating a single synthetic
 * "owner" identity, good enough to exercise every admin route locally
 * without standing up Clerk, and nothing more. The real, deployed
 * implementation is @mercatus-liber/adapter-clerk. This is the same
 * "good enough to run without infra, not a production security boundary"
 * posture every other in-memory reference implementation in this repo
 * takes (see e.g. the in-memory repositories throughout packages/*).
 * ============================================================================
 *
 * getCurrentSession() has no way to read an incoming request's real Cookie
 * header on its own (this package depends on @mercatus-liber/core only --
 * no Next.js, no HTTP framework of any kind), so cookie lookup is injected
 * at construction time via `deps.getSessionCookie`, matching this repo's
 * usual dependency-injected adapter-factory pattern (see e.g.
 * createDefaultBiAdapter in @mercatus-liber/internal-bi). The host app
 * (apps/reference-storefront) is expected to pass a closure that reads the
 * real cookie via `next/headers`; with no override, no cookie is ever
 * considered present.
 *
 * listAdminUsers() and setAdminUserRole() are intentionally minimal --
 * this default models single-operator local development only, never
 * multi-user role management (that is adapter-clerk's real job):
 *  - listAdminUsers() always returns exactly one synthetic "dev-owner" entry.
 *  - setAdminUserRole() always throws "not supported in dev mode" -- there
 *    is no second user to promote or demote in single-operator dev mode.
 */
export function createDefaultAdminAuthAdapter(deps?: {
  getSessionCookie?: () => string | undefined;
}): AdminAuthAdapter {
  const getSessionCookie = deps?.getSessionCookie ?? (() => undefined);

  return {
    async getCurrentSession(): Promise<AdminSession | null> {
      const cookie = getSessionCookie();
      if (!cookie) return null;
      if (!verifyDevPassword(cookie)) return null;
      return { userId: DEV_OWNER_USER_ID, email: DEV_OWNER_EMAIL, role: DEV_OWNER_ROLE };
    },

    async listAdminUsers() {
      return [{ userId: DEV_OWNER_USER_ID, email: DEV_OWNER_EMAIL, role: DEV_OWNER_ROLE }];
    },

    async setAdminUserRole(): Promise<void> {
      throw new Error("not supported in dev mode");
    },
  };
}
