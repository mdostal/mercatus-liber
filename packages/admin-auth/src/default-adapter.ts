import type { AdminAuthAdapter, AdminRole, AdminSession } from "./types.js";

/** Name of the session cookie the dev default checks for. The host app is responsible for actually setting/clearing this cookie on its dev sign-in/sign-out routes -- this package only ever reads its value. */
export const ADMIN_DEV_SESSION_COOKIE = "ml_admin_dev_session";

const DEV_OWNER_USER_ID = "dev-owner";
const DEV_OWNER_EMAIL = "dev-owner@localhost";
const DEV_OWNER_ROLE: AdminRole = "owner";
const DEV_VIEWER_USER_ID = "dev-viewer";
const DEV_VIEWER_EMAIL = "dev-viewer@localhost";
const DEV_VIEWER_ROLE: AdminRole = "viewer";

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
 * real-provider-verification epic: a second, deliberately lower-privilege
 * password for outside reviewers exploring a public demo -- distinct from
 * `verifyDevPassword`'s single shared owner password. Real motivation: this
 * app's own per-store `/start` page (epic 54) publishes the OWNER password
 * on a public page by design, since there's no per-visitor account system
 * and the whole point is letting a stranger explore without contacting the
 * site owner first -- but that meant every visitor got full mutate/
 * manage_users access too. `ADMIN_VIEWER_PASSWORD`, when set, lets a
 * visitor authenticate as a genuine read-only `viewer` role instead
 * (hasPermission's own existing 3-role matrix already understands
 * "viewer" -- this only wires the dev-default adapter to actually be able
 * to PRODUCE one, which it previously could not: getCurrentSession always
 * hardcoded role "owner"). Returns false whenever the env var is unset or
 * empty, same posture as verifyDevPassword.
 */
export function verifyDevViewerPassword(password: string): boolean {
  const expected = process.env.ADMIN_VIEWER_PASSWORD;
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
 * this default models single-operator local development only, never real
 * multi-user role management (that is adapter-clerk's real job):
 *  - listAdminUsers() always returns a synthetic "dev-owner" entry, plus a
 *    synthetic "dev-viewer" entry too when ADMIN_VIEWER_PASSWORD is set
 *    (see verifyDevViewerPassword above) -- still not real per-user
 *    management, just two fixed synthetic identities instead of one.
 *  - setAdminUserRole() always throws "not supported in dev mode" -- there
 *    is no real per-user promotion/demotion in this dev-default model,
 *    only the two fixed passwords.
 */
export function createDefaultAdminAuthAdapter(deps?: {
  getSessionCookie?: () => string | undefined;
}): AdminAuthAdapter {
  const getSessionCookie = deps?.getSessionCookie ?? (() => undefined);

  return {
    async getCurrentSession(): Promise<AdminSession | null> {
      const cookie = getSessionCookie();
      if (!cookie) return null;
      // Owner checked first -- if a deployment ever sets both passwords to
      // the same value (a misconfiguration, not a supported setup), owner
      // wins rather than silently downgrading access.
      if (verifyDevPassword(cookie)) {
        return { userId: DEV_OWNER_USER_ID, email: DEV_OWNER_EMAIL, role: DEV_OWNER_ROLE };
      }
      if (verifyDevViewerPassword(cookie)) {
        return { userId: DEV_VIEWER_USER_ID, email: DEV_VIEWER_EMAIL, role: DEV_VIEWER_ROLE };
      }
      return null;
    },

    async listAdminUsers() {
      const users = [{ userId: DEV_OWNER_USER_ID, email: DEV_OWNER_EMAIL, role: DEV_OWNER_ROLE }];
      if (process.env.ADMIN_VIEWER_PASSWORD) {
        users.push({ userId: DEV_VIEWER_USER_ID, email: DEV_VIEWER_EMAIL, role: DEV_VIEWER_ROLE });
      }
      return users;
    },

    async setAdminUserRole(): Promise<void> {
      throw new Error("not supported in dev mode");
    },
  };
}
