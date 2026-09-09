# Design Discussion — Epic 27: `admin-auth-clerk`

## 0. Prelude

**Source:** a direct finding from a fresh gap audit (2026-09-08), confirmed with the user
directly: `/admin` has **zero authentication anywhere** — no `middleware.ts`, no layout guard,
no role concept in the repo at all. This is not a disclosed, deferred gap like payments'
single adapter or Sanity's discoverability — it was never scoped in or out by any prior epic.
It is also **live and exploitable today**: `demo-shop.mdostal.com`'s `/admin` is fully public,
full CRUD, no gate.

**User's explicit direction:**
1. Build the real fix now, no interim stopgap.
2. Shape it as an adapter contract (matching this repo's whole pattern — narrow interface,
   swappable implementation) — but the deployment will run on **Clerk, specifically**, not a
   generic "any provider" abstraction with Clerk as one hypothetical option. Quote: "we will
   be building on clerk 100% i love clerk."
3. Three roles, not one: **owner, admin, viewer** — owner sets up company info and has full
   access; admin runs day-to-day (orders, promotions, etc.); viewer is read-only (numbers/
   reports), no mutations.

## 1. Goal

Every `/admin` route requires a real, authenticated Clerk session. Every admin mutation checks
the authenticated user's role. An owner can manage which humans have which role.

## 2. Research findings (grounding)

- **Next.js 16.3.4, App Router, zero `middleware.ts` today.** Middleware with a route
  `matcher` is the current, supported Next.js mechanism for gating `/admin/:path*` — nothing
  in this Next.js generation deprecates it. Every existing admin page
  (`app/admin/page.tsx`, `app/admin/orders/page.tsx`, etc.) is a plain, independent Server
  Component with zero shared layout wrapper — `app/admin/layout.tsx` does not exist yet
  either.
- **No prior art to reconcile with.** A repo-wide grep for `role`/`permission` returns zero
  hits. `packages/account` (subsystem 10, shopper-facing profile/order-history) has zero
  overlap — its own doc's open questions explicitly haven't even resolved *shopper* auth yet,
  let alone admin auth, and its "explicitly not this subsystem's job" posture argues against
  bolting admin concerns onto it. Admin auth is a genuinely new, separate subsystem.
- **The three most recent adapter contracts** (`CatalogPersistenceAdapter`,
  `CmsPersistenceAdapter`, `BiMetricsAdapter`) all follow one shape: a narrow bundle interface
  in the subsystem's own `types.ts`, a zero-infra default implementation shipped in the same
  package, and any *real* concrete implementation living in its own sibling `adapter-*`
  package (`adapter-sqlite`, `adapter-sanity`) — never inside the subsystem package itself,
  and `apps/reference-storefront/lib/services.ts` is the one place that ever imports a
  concrete implementation.
- **No Clerk package installed.** Next.js 16 + App Router means the current Clerk SDK
  generation applies: `clerkMiddleware()` from `@clerk/nextjs/server` paired with
  `<ClerkProvider>` in the root layout — not the legacy `authMiddleware()` API.
- **`README.md` has no environment-variable documentation section at all today** — this is a
  new addition, not an edit to an existing one.

## 3. The design question, resolved: `@mercatus-liber/admin-auth` (contract + dev default) + `@mercatus-liber/adapter-clerk` (the real implementation) — role data lives in Clerk's own user metadata, not a second local database

**Decision: new subsystem, `admin-auth` (package `@mercatus-liber/admin-auth`), subsystem 21.**
Depends on `@mercatus-liber/core` only. Declares:

```ts
type AdminRole = "owner" | "admin" | "viewer";
interface AdminSession { userId: string; email: string; role: AdminRole }
interface AdminAuthAdapter {
  getCurrentSession(): Promise<AdminSession | null>;
  listAdminUsers(): Promise<{ userId: string; email: string; role: AdminRole }[]>;
  setAdminUserRole(userId: string, role: AdminRole): Promise<void>;
}
```

`getCurrentSession()` takes no request argument, matching how Next.js App Router context
(`next/headers`, and Clerk's own `auth()`) is implicitly available to any Server Component or
middleware call — both the dev default and the real Clerk implementation read the ambient
request context themselves, so callers never thread a `Request` object through.

A small, pure permission-check module ships alongside it:
`hasPermission(role: AdminRole, action: "view" | "mutate" | "manage_users"): boolean` — owner
can do everything; admin can view and mutate but not manage users; viewer can only view.

**A zero-infra dev default** (`createDefaultAdminAuthAdapter`) ships in the same package for
local development without a Clerk account: a single shared `ADMIN_DEV_PASSWORD` env var
gates a session cookie that always resolves to role `"owner"` — explicitly, loudly documented
as **local-development-only, never a real access-control mechanism**, the same posture the
in-memory reference repositories take everywhere else in this codebase (good enough to run
without infra, not a production security boundary).

**The real implementation is `@mercatus-liber/adapter-clerk`, a new sibling package**
(mirroring `adapter-sqlite`/`adapter-sanity`'s separation from their subsystem), implementing
`AdminAuthAdapter` against `@clerk/nextjs/server`'s `auth()`/`currentUser()` for session
lookup, and Clerk's Backend SDK (`clerkClient`) for `listAdminUsers`/`setAdminUserRole`.

**Why role data lives in Clerk's own `publicMetadata`, not a second local table:** the user
was explicit that this deployment runs on Clerk end-to-end. Clerk's own user object already
supports arbitrary metadata a backend can read/write. Building a *separate* local
`AdminUserRepository` that has to stay in sync with "who actually has a Clerk account" would
be a second source of truth for the exact same fact, with a real drift risk (a user removed in
Clerk but still present locally, or vice versa) — an unforced complication epic 18's own CMS
work never needed and this shouldn't invent either. `adapter-clerk`'s `listAdminUsers`/
`setAdminUserRole` are thin wrappers over Clerk's Backend SDK reading/writing
`publicMetadata.role` — Clerk itself remains the single source of truth for both identity and
role.

**Enforcement is two-layered, on purpose:**
1. **`middleware.ts`** (new, root of `apps/reference-storefront`) — `clerkMiddleware()`
   wrapping a check that any `/admin/:path*` request has an authenticated session, redirecting
   to Clerk's sign-in flow otherwise. This is authentication (is anyone logged in), enforced
   at the edge before any admin code runs.
2. **`app/admin/layout.tsx`** (new) — a Server Component wrapping every admin page, calling
   `adminAuth.getCurrentSession()` as defense-in-depth, and every existing `"use server"`
   admin mutation action (`lib/actions.ts`) gains a `requireAdminPermission(session, "mutate")`
   / `requireAdminPermission(session, "manage_users")` guard at its top — this is
   authorization (what can this specific role do), which middleware's route-level matcher
   can't express (middleware can't distinguish "logged in as viewer, blocked from mutating"
   from "logged in as owner, allowed").

## 4. Explicitly out of scope / disclosed gaps

- **Live end-to-end verification against a real Clerk account is pending real credentials.**
  No Clerk secrets exist in this environment's vault as of this epic's planning. Every piece
  buildable without live credentials (the contract, the dev default, `adapter-clerk`'s logic
  unit-tested against a mocked Clerk SDK client, the middleware/layout/mutation-gating wiring)
  is built now; the final live-session verification against the user's real Clerk account
  happens once they provide keys — the same disclosed-gap posture epic 18 took for Sanity
  credentials and epic 20's own docs took for a second payment provider.
- **Shopper-facing auth** (subsystem 10, `packages/account`) is untouched — this epic is
  admin-only. Whether shoppers ever get real accounts via Clerk too is a separate, future
  decision, not assumed here.
- **Fine-grained, per-object permissions** (e.g. "this specific admin can only edit
  promotions, not advertising") are out of scope — the three-role model is deliberately flat,
  matching the user's own stated shape (owner/admin/viewer), not a general permissions-matrix
  system.

## 5. Scale assessment

**Large.** A new subsystem, a new adapter package, root middleware, a new shared admin
layout, and a mutation-gating change touching every existing `"use server"` admin action
across 5+ files. This is the first epic in this wave that genuinely reaches into every prior
epic's admin surface at once — proceeding with 5 stories instead of the usual 4, given the
real breadth.

## 6. Version bump

`minor` — a new package, a new adapter package, and additive route protection. Not `major`
despite touching many files, since no existing subsystem's public *package* contract changes
(only the app layer's own admin routes gain a new, previously-absent requirement).
