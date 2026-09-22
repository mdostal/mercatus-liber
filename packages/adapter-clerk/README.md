# @mercatus-liber/adapter-clerk

A real `AdminAuthAdapter` (subsystem 21, `@mercatus-liber/admin-auth`) implementation backed by [Clerk](https://clerk.com)'s Next.js SDK (`auth()`, `currentUser()`) and Backend SDK (`clerkClient().users`). This is the counterpart to `@mercatus-liber/adapter-sanity`: its entire job is wrapping a real third-party SDK so `@mercatus-liber/admin-auth`'s `AdminAuthAdapter` contract stays genuinely swappable, with the local, zero-infra `createDefaultAdminAuthAdapter` (shipped in `@mercatus-liber/admin-auth` itself) as the other implementation.

## Environment variables

Clerk's own SDK reads these directly from the environment -- this package does not read or re-declare them itself:

- `CLERK_SECRET_KEY` -- the Backend API secret key, used server-side by `auth()`, `currentUser()`, and `clerkClient()`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` -- the publishable key identifying the Clerk instance, read by **both** server-side code (`clerkMiddleware()`, `auth()`, `clerkClient()`) and client-side code (`<ClerkProvider>`, `<UserButton>`). There is no separate, non-`NEXT_PUBLIC_`-prefixed `CLERK_PUBLISHABLE_KEY` this SDK version reads anywhere.

**Correction, 2026-09-22 (real-provider-verification, epic 56):** an earlier version of this doc
claimed a *separate* `CLERK_PUBLISHABLE_KEY` (no `NEXT_PUBLIC_` prefix) was also read server-side,
"confirmed by inspecting `server/constants.js`" -- that inspection was wrong, or the file changed
under it; re-reading the actual installed `@clerk/nextjs@7.9.1` (`dist/cjs/server/constants.js`)
during this fix shows exactly one line resolving the publishable key:
`const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";` -- no fallback to
any other env var name, server or client. This matters in practice: setting only the (nonexistent)
`CLERK_PUBLISHABLE_KEY` name while leaving `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset makes
`PUBLISHABLE_KEY` resolve to `""`, and `clerkMiddleware()` throws `MissingPublishableKeyError` the
instant any matched request comes in -- reproduced live, locally, against a real Clerk test-mode
key during this fix: every route covered by `middleware.ts`'s broad matcher (nearly the whole app)
returned a 500, not just `/admin`. This is very likely the real, disclosed root cause of the
"`/admin` 404 regression" mentioned in `.pHive/planning/epic-backlog.md` row 56's earlier update --
someone plausibly followed this doc's previous (wrong) guidance when setting production env vars.

### A related, non-bug gotcha: `/admin` 404s for non-browser requests, by design

Separately from the above, `auth.protect()` (called from `middleware.ts` with no arguments) does
**not** always redirect an unauthenticated visitor to sign-in. Reading `@clerk/nextjs@7.9.1`'s own
`server/protect.js`: `handleUnauthenticated()` only calls `redirectToSignIn()` when
`isPageRequest(request)` is true (the request carries `Sec-Fetch-Dest: document`/`iframe`, an
`Accept: text/html` header, or looks like a Next.js internal app-router navigation) -- otherwise it
falls through to `notFound()`, which `clerkMiddleware.js`'s own `handleControlFlowErrors` converts
into a deliberate internal rewrite to a nonexistent `/clerk_<timestamp>` path specifically to force
a genuine Next.js 404 (see that file's own comment: "This is an internal rewrite purely to trigger
a not found error"). A bare `curl http://.../demo/<slug>/admin` (no browser fetch-metadata headers)
reliably reproduces this real 404 -- confirmed live during this fix -- while the exact same URL in
a real browser (or `curl` with `-H "Accept: text/html" -H "Sec-Fetch-Dest: document"`) correctly
gets a `307` to Clerk's hosted sign-in flow. Anyone re-verifying this route with a raw HTTP client
rather than a browser should expect this and not mistake it for a regression.

## Where role data lives

`setAdminUserRole` and `listAdminUsers` read and write Clerk's own `publicMetadata.role` on each Clerk `User` -- this package owns no user or role store of its own. That means an owner can also assign or change a user's admin role directly from **Clerk's own dashboard** (Users -> a user -> Metadata -> Public), not only through this repo's admin UI. Both paths edit the same field, so they stay in sync automatically.

`getCurrentSession()` and `listAdminUsers()` resolve a role by reading `publicMetadata.role` and mapping it to one of `"owner" | "admin" | "viewer"`. If that field is missing, or holds anything other than one of those three exact strings, the role resolves to `"viewer"` -- fail **closed**, never to a more-privileged default. This matters because `publicMetadata` is arbitrary JSON a dashboard operator (or a bug) could leave empty or malformed; this package never treats that as license to grant elevated access.

## Testing gap: no live Clerk account in this environment

This package's own logic (role-mapping, the fail-closed default, argument plumbing into Clerk's Backend SDK calls) is exercised in `test/adapter-clerk.test.ts` **entirely against an injected mock Clerk client** -- see `createClerkAdminAuthAdapter`'s optional `deps` parameter (`auth`, `currentUser`, `users`), each of which defaults to the real `@clerk/nextjs/server` import when not supplied. No test in this package ever makes a live network call.

**Update 2026-09-22 (real-provider-verification, epic 56): this gap is now closed.** Real
`CLERK_SECRET_KEY`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` test-mode credentials were provided, wired
into a local dev server, and exercised end-to-end against a real Clerk instance (`more-lark-7491`):
`auth.protect()` correctly redirects an unauthenticated real-browser request to Clerk's hosted
sign-in across all 3 demos, a real test admin user was created via the Clerk Backend API and
completed a real sign-in, and `hasPermission` was confirmed gating a real mutation for both
`owner` and `viewer` roles set via `publicMetadata.role`. See
`.pHive/planning/epic-backlog.md` row 56 for the full verification log.

## Usage

```ts
import { createClerkAdminAuthAdapter } from "@mercatus-liber/adapter-clerk";

// Real, deployed adapter -- reads CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY
// from the environment via @clerk/nextjs/server, same as any other Clerk-
// backed Next.js route.
const adminAuthAdapter = createClerkAdminAuthAdapter();
```

Wired into `apps/reference-storefront/lib/services.ts` the same way every other adapter contract in this repo is chosen and wired.
