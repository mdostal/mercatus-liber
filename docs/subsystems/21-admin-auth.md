# Subsystem 21 — Admin Auth

## Purpose
Authentication and role-based authorization for every `/admin` route — a real gap this repo
had until 2026-09-08 (no auth existed anywhere in `/admin`, confirmed live-exploitable on a
public deployment). Three roles: owner (full access, manages other admin users), admin
(day-to-day operations, no user management), viewer (read-only).

## Depends on
`@mercatus-liber/core` only. The real, deployed implementation lives in a separate sibling
package, `@mercatus-liber/adapter-clerk`, which wraps `@clerk/nextjs/server` and Clerk's
Backend SDK — this package itself never imports Clerk or any other identity provider.
`apps/reference-storefront/lib/services.ts` is the only place a concrete `AdminAuthAdapter`
implementation is ever chosen and wired in, matching every other adapter contract in this repo.

## Responsibilities
- `AdminRole` ("owner" | "admin" | "viewer"), `AdminSession { userId, email, role }`.
- `AdminAuthAdapter`: the swappable contract — `getCurrentSession()`, `listAdminUsers()`,
  `setAdminUserRole(userId, role)`.
- `hasPermission(role, action)`: a small, pure permission-check function ("view" | "mutate" |
  "manage_users").
- `createDefaultAdminAuthAdapter()`: a zero-infra, local-development-only default (a shared
  env-var password gating a session cookie, always role `"owner"`) — explicitly not a
  production access-control mechanism.
- Route-level enforcement: `apps/reference-storefront/middleware.ts` (authentication, via
  Clerk) + `apps/reference-storefront/app/admin/layout.tsx` (authorization, defense-in-depth)
  + a `requireAdminPermission` guard on every existing admin mutation action.

## Explicitly NOT this subsystem's job
- Shopper-facing authentication (subsystem 10, `packages/account`) — untouched by this epic.
- Storing role assignments in a second, locally-owned database — role data lives in Clerk's
  own `publicMetadata`, read/written by `adapter-clerk`, so Clerk stays the single source of
  truth for both identity and role. See `.pHive/epics/admin-auth-clerk/docs/design-discussion.md`
  §3 for the full reasoning.
- Fine-grained, per-object permissions beyond the flat three-role model.
- A real external identity provider besides Clerk — the contract is shaped to be swappable in
  principle (matching this repo's whole adapter posture), but only Clerk has a real, deployed
  implementation; that was the user's explicit, deliberate choice, not a disclosed gap to fill
  later.

## Decoupling notes
`packages/admin-auth`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rn "@mercatus-liber/admin-auth" packages/cart packages/checkout-orders/src
packages/catalog/src packages/account/src` (and every other subsystem package) before merge —
every one of those must return zero hits; `admin-auth` and `adapter-clerk` are consumed only
by `apps/reference-storefront`. `packages/adapter-clerk` itself is the one package in this
repo whose entire job is importing a third-party identity SDK — that is its purpose, not a
decoupling violation, exactly like `adapter-sqlite` importing `better-sqlite3` or
`adapter-sanity` importing Sanity's client.

## Open questions
1. ~~Live end-to-end verification against a real Clerk account is pending the user's actual
   Clerk credentials~~ **Resolved 2026-09-22 (real-provider-verification, epic 56,
   `fix/admin-auth-clerk-live`).** Real test-mode `CLERK_SECRET_KEY`/
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` credentials were wired into a local dev server and
   exercised end-to-end: all 3 demos' `/admin` correctly redirect an unauthenticated real
   browser to Clerk's hosted sign-in; a real Clerk test user (`+clerk_test` address, Clerk's own
   documented no-real-email test convention) signed in and landed back on the right demo's
   `/admin`; `hasPermission` was confirmed gating a real `createPromotionAction` mutation —
   blocked with a real "Not authorized" error for `viewer`, allowed once the same session's
   `publicMetadata.role` was flipped to `owner` via the Clerk Backend API, with no re-login
   needed (role is read fresh from Clerk each request, never cached). The zero-infra
   `ADMIN_DEV_PASSWORD`/`ADMIN_VIEWER_PASSWORD` fallback was independently re-verified unchanged
   with Clerk env vars unset. The real, disclosed prior "`/admin` 404/500 regression" (this
   file's own history, `.pHive/planning/epic-backlog.md` row 56) traced to this repo's own
   README documenting a non-existent `CLERK_PUBLISHABLE_KEY` env var name — the real SDK
   (`@clerk/nextjs@7.9.1`) only ever reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, confirmed by
   reading its published source. Fixed in both READMEs, plus a new defensive runtime check
   (`apps/reference-storefront/lib/clerk-env-check.ts`, wired into `middleware.ts`) that fails
   with a specific, actionable message instead of Clerk's generic
   `MissingPublishableKeyError` if this exact misconfiguration recurs.
2. Should shopper accounts (subsystem 10) eventually also run through Clerk, unifying
   identity across shopper and admin surfaces? Deliberately out of scope for this epic — admin
   auth was the urgent, live-exploitable gap; shopper auth is a separate future decision.
