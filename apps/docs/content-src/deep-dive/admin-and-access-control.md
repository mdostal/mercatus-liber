# Admin & Access Control

Until 2026-09-08, this repository had no authentication anywhere under `/admin` at all — a real
gap, confirmed live-exploitable on a public deployment, not a hypothetical one. The
[admin-auth](/subsystems/21-admin-auth) subsystem closes that gap with a small, deliberately
flat role model and a real, deployed identity provider behind it: [Clerk](https://clerk.com).
This page covers the contract, the role model, and — importantly — *why* Clerk specifically,
because that choice was the user's own explicit decision, not a generic "bring your own
identity provider" abstraction dressed up as one.

## The contract: `AdminAuthAdapter`

Like every other swappable boundary in this framework — persistence, payments, CMS — admin auth
is a single named interface that a deployment implements against a real identity provider. The
interface itself lives in `@mercatus-liber/admin-auth` and never imports Clerk, or any other
identity SDK, at all:

```ts
// packages/admin-auth/src/types.ts
export type AdminRole = "owner" | "admin" | "viewer";

/** The authenticated admin identity for the current request -- never a shopper account (subsystem 10, @mercatus-liber/account, is untouched by this). */
export interface AdminSession {
  userId: string;
  email: string;
  role: AdminRole;
}

export interface AdminAuthAdapter {
  getCurrentSession(): Promise<AdminSession | null>;
  listAdminUsers(): Promise<{ userId: string; email: string; role: AdminRole }[]>;
  setAdminUserRole(userId: string, role: AdminRole): Promise<void>;
}
```

`getCurrentSession()` deliberately takes no request argument. That matches how Next.js App
Router request context works — `next/headers`, Clerk's own `auth()` — both are implicitly
available to any Server Component or middleware call, so neither the dev default nor the real
Clerk implementation needs a Request object threaded through by hand.

## The role model: three roles, nine permissions, one pure function

The permission model is intentionally flat — three roles, not a fine-grained per-object ACL
system — because that's what a small commerce operation's admin surface actually needs: someone
who can do everything including manage other admins (`owner`), someone who runs day-to-day
operations but can't touch user management (`admin`), and someone who can look but not touch
(`viewer`). The whole matrix is nine combinations, checked by one pure function with no I/O:

```ts
// packages/admin-auth/src/permissions.ts
/** The three things a caller ever asks permission for -- a flat, three-role model, deliberately not fine-grained per-object permissions. */
export type AdminAction = "view" | "mutate" | "manage_users";

/**
 * Pure permission check, no I/O -- the full owner/admin/viewer x
 * view/mutate/manage_users matrix (9 combinations):
 *  - owner:  view=true,  mutate=true,  manage_users=true
 *  - admin:  view=true,  mutate=true,  manage_users=false
 *  - viewer: view=true,  mutate=false, manage_users=false
 */
export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  if (role === "owner") return true;
  if (role === "admin") return action === "view" || action === "mutate";
  return action === "view"; // viewer
}
```

Every admin mutation action in the reference storefront is gated by a `requireAdminPermission`
guard built on this function, on top of two other layers of enforcement:
`apps/reference-storefront/middleware.ts` handles *authentication* (is there a real, signed-in
Clerk session at all) and `apps/reference-storefront/app/admin/layout.tsx` handles
*authorization* as defense-in-depth (does this session's role actually permit being here). Three
layers, one shared `hasPermission` function underneath all of them — never three separate
implementations of the same check.

## Why Clerk: a real, deployed adapter, not a placeholder

The `AdminAuthAdapter` interface is shaped to be provider-swappable in principle, matching this
repo's adapter posture everywhere else — but only Clerk has a real, deployed implementation
today, and the subsystem doc is explicit that this was **the user's own deliberate choice, not
a disclosed gap waiting to be filled**. `packages/adapter-clerk` is the one package in this
repo whose entire job is importing a third-party identity SDK — exactly the same posture as
`adapter-sqlite` importing `better-sqlite3` or `adapter-sanity` importing Sanity's client, not a
decoupling violation.

The other deliberate decision worth calling out: role data is **not** stored in a second,
locally-owned database. It lives entirely in Clerk's own `publicMetadata`, read and written by
the adapter, so Clerk stays the single source of truth for both identity *and* role — which
also means Clerk's own dashboard remains a valid way to assign roles, not just this repo's admin
UI:

```ts
// packages/adapter-clerk/src/index.ts
const VALID_ROLES: readonly AdminRole[] = ["owner", "admin", "viewer"];

/**
 * Reads whatever `publicMetadata.role` happens to hold -- untyped JSON set by
 * a dashboard operator, a prior write from this package, or nothing at all --
 * and resolves it to a known AdminRole. Anything that isn't exactly one of
 * the three valid role strings (missing, wrong type, typo'd value, etc.)
 * resolves to "viewer".
 *
 * Fail CLOSED: malformed or absent role metadata must never grant "admin" or
 * "owner" access.
 */
function toAdminRole(value: unknown): AdminRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value) ? (value as AdminRole) : "viewer";
}
```

That fail-closed default matters: any surprise shape of `publicMetadata.role` — missing, the
wrong type, a typo — resolves to the *least* privileged role rather than silently granting
`admin` or `owner`. It's the one choke point every code path in the adapter goes through, so
there's exactly one place that decision is ever made.

The real adapter itself wraps three Clerk entry points — `auth()` for the current request's
signed-in user id, `currentUser()` for the full user record, and `clerkClient().users` for the
Backend SDK's user-management calls — each injectable at construction time so tests can
substitute a mock instead of exercising a live Clerk account:

```ts
// packages/adapter-clerk/src/index.ts
export function createClerkAdminAuthAdapter(deps?: ClerkAdminAuthAdapterDeps): AdminAuthAdapter {
  // ... getAuth/getCurrentUser/getUsers default to the real @clerk/nextjs/server calls
  return {
    async getCurrentSession(): Promise<AdminSession | null> {
      const { userId } = await getAuth();
      if (!userId) return null;

      const user = await getCurrentUser();
      if (!user) return null;

      return toSessionEntry(user);
    },

    async setAdminUserRole(userId: string, role: AdminRole): Promise<void> {
      const users = await getUsers();
      await users.updateUserMetadata(userId, { publicMetadata: { role } });
    },
  };
}
```

## Running without Clerk: the local-development default

Standing up a real Clerk account isn't a prerequisite for exploring the framework locally. A
second, zero-infra implementation of the same `AdminAuthAdapter` interface — `createDefaultAdminAuthAdapter`
— ships in `packages/admin-auth` itself, gated by a single shared password read from
`process.env.ADMIN_DEV_PASSWORD`:

```ts
// packages/admin-auth/src/default-adapter.ts
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
```

The doc comment above this file in the real source is unambiguous, and worth repeating
verbatim: **"NOT A PRODUCTION SECURITY BOUNDARY. Do not deploy this adapter anywhere a real user
could reach it."** There's no per-user session store, no expiry, no CSRF protection, and no rate
limiting on the password check — it's a single shared password gating a single synthetic
`"owner"` identity, good enough to exercise every admin route locally without standing up Clerk,
and nothing more. `listAdminUsers()` always returns exactly one synthetic `dev-owner` entry, and
`setAdminUserRole()` always throws `"not supported in dev mode"` — there's no second user to
promote or demote in single-operator local development.

Both adapters are wired the same way every other adapter in this framework is chosen: as a
single line in `apps/reference-storefront/lib/services.ts`, gated by whether `CLERK_SECRET_KEY`
and `CLERK_PUBLISHABLE_KEY` are actually set, per the root `README.md`'s Configuration section.

## Further reading

- [Subsystem 21 — Admin Auth](/subsystems/21-admin-auth)
- [Planning corpus: admin-auth-clerk](/planning/admin-auth-clerk)
