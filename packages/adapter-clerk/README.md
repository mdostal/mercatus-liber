# @mercatus-liber/adapter-clerk

A real `AdminAuthAdapter` (subsystem 21, `@mercatus-liber/admin-auth`) implementation backed by [Clerk](https://clerk.com)'s Next.js SDK (`auth()`, `currentUser()`) and Backend SDK (`clerkClient().users`). This is the counterpart to `@mercatus-liber/adapter-sanity`: its entire job is wrapping a real third-party SDK so `@mercatus-liber/admin-auth`'s `AdminAuthAdapter` contract stays genuinely swappable, with the local, zero-infra `createDefaultAdminAuthAdapter` (shipped in `@mercatus-liber/admin-auth` itself) as the other implementation.

## Environment variables

Clerk's own SDK reads these directly from the environment -- this package does not read or re-declare them itself:

- `CLERK_SECRET_KEY` -- the Backend API secret key, used server-side by `auth()`, `currentUser()`, and `clerkClient()`.
- `CLERK_PUBLISHABLE_KEY` (and its client-exposed equivalent `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, if `apps/reference-storefront` also renders any Clerk client components) -- the publishable key identifying the Clerk instance.

Both names were confirmed by inspecting `@clerk/nextjs@7.9.1`'s and `@clerk/backend@3.17.1`'s own published source (`server/constants.js`), not guessed from older docs.

## Where role data lives

`setAdminUserRole` and `listAdminUsers` read and write Clerk's own `publicMetadata.role` on each Clerk `User` -- this package owns no user or role store of its own. That means an owner can also assign or change a user's admin role directly from **Clerk's own dashboard** (Users -> a user -> Metadata -> Public), not only through this repo's admin UI. Both paths edit the same field, so they stay in sync automatically.

`getCurrentSession()` and `listAdminUsers()` resolve a role by reading `publicMetadata.role` and mapping it to one of `"owner" | "admin" | "viewer"`. If that field is missing, or holds anything other than one of those three exact strings, the role resolves to `"viewer"` -- fail **closed**, never to a more-privileged default. This matters because `publicMetadata` is arbitrary JSON a dashboard operator (or a bug) could leave empty or malformed; this package never treats that as license to grant elevated access.

## Testing gap: no live Clerk account in this environment

This package's own logic (role-mapping, the fail-closed default, argument plumbing into Clerk's Backend SDK calls) is exercised in `test/adapter-clerk.test.ts` **entirely against an injected mock Clerk client** -- see `createClerkAdminAuthAdapter`'s optional `deps` parameter (`auth`, `currentUser`, `users`), each of which defaults to the real `@clerk/nextjs/server` import when not supplied. No test in this package ever makes a live network call.

There are no live Clerk credentials in this environment as of this piece of work. End-to-end verification against a real Clerk account -- confirming `auth()`/`currentUser()`/`clerkClient()` actually behave the way their published types say they do against a live Clerk instance -- is a separate, later step once real `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` credentials exist. This is the same disclosed-gap posture `@mercatus-liber/adapter-sanity` takes for Sanity credentials, not silently claimed as fully verified.

## Usage

```ts
import { createClerkAdminAuthAdapter } from "@mercatus-liber/adapter-clerk";

// Real, deployed adapter -- reads CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY
// from the environment via @clerk/nextjs/server, same as any other Clerk-
// backed Next.js route.
const adminAuthAdapter = createClerkAdminAuthAdapter();
```

Wired into `apps/reference-storefront/lib/services.ts` the same way every other adapter contract in this repo is chosen and wired.
