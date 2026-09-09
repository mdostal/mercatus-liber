/**
 * The three admin roles this subsystem recognizes, in ascending order of
 * privilege: viewer (read-only), admin (day-to-day operations, no user
 * management), owner (full access, including managing other admin users).
 * See docs/subsystems/21-admin-auth.md.
 */
export type AdminRole = "owner" | "admin" | "viewer";

/** The authenticated admin identity for the current request -- never a shopper account (subsystem 10, @mercatus-liber/account, is untouched by this). */
export interface AdminSession {
  userId: string;
  email: string;
  role: AdminRole;
}

/**
 * The swappable contract (subsystem 21) -- mirrors BiMetricsAdapter/
 * CatalogPersistenceAdapter/CmsPersistenceAdapter: a single named interface
 * a deployment implements against a real identity provider, with
 * `createDefaultAdminAuthAdapter` (default-adapter.ts) as the zero-infra,
 * local-development-only reference implementation shipped in this package.
 *
 * This package never imports Clerk or any other identity provider -- the
 * real, deployed implementation is `@mercatus-liber/adapter-clerk`, a
 * separate sibling package wrapping `@clerk/nextjs/server` and Clerk's
 * Backend SDK, wired in at `apps/reference-storefront/lib/services.ts` the
 * same way every other adapter contract in this repo is chosen and wired.
 * Role data is never owned by this package or by adapter-clerk's own store
 * -- it lives in Clerk's `publicMetadata`, so Clerk stays the single source
 * of truth for both identity and role. See
 * .pHive/epics/admin-auth-clerk/docs/design-discussion.md section 3.
 *
 * `getCurrentSession()` deliberately takes no request argument, matching
 * how Next.js App Router context (`next/headers`, Clerk's own `auth()`) is
 * implicitly available to any Server Component or middleware call -- both
 * the dev default and the real Clerk implementation read ambient request
 * context themselves rather than requiring callers to thread a Request
 * object through.
 */
export interface AdminAuthAdapter {
  getCurrentSession(): Promise<AdminSession | null>;
  listAdminUsers(): Promise<{ userId: string; email: string; role: AdminRole }[]>;
  setAdminUserRole(userId: string, role: AdminRole): Promise<void>;
}
