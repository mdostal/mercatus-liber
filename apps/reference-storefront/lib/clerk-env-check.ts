/**
 * admin-auth-clerk-live: a pure, unit-testable guard against the exact
 * misconfiguration that caused the real, disclosed "/admin 404/500
 * regression" documented in .pHive/planning/epic-backlog.md row 56.
 *
 * Root cause (confirmed by reading @clerk/nextjs@7.9.1's own published
 * source, `server/constants.js`): the server-side Clerk SDK
 * (`clerkMiddleware()`, `auth()`, `clerkClient()`) reads the publishable key
 * exclusively from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` -- there is no
 * separate, non-`NEXT_PUBLIC_`-prefixed `CLERK_PUBLISHABLE_KEY` this SDK
 * version ever reads, anywhere, despite this repo's own README previously
 * (wrongly) documenting one. Deploying with `CLERK_SECRET_KEY` set but
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset -- e.g. because whoever set env
 * vars followed that stale doc and set `CLERK_PUBLISHABLE_KEY` instead --
 * makes `clerkMiddleware()` throw Clerk's own generic
 * `MissingPublishableKeyError` on literally every request the app's broad
 * middleware matcher covers (reproduced live, locally, during this fix:
 * nearly the whole site 500s, not just `/admin`).
 *
 * This module exists so that specific, common misconfiguration produces an
 * obvious, actionable error message identifying exactly what's wrong,
 * instead of relying solely on Clerk's own generic error text to be
 * noticed in production logs.
 */

export interface ClerkEnvLike {
  CLERK_SECRET_KEY?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  /** The wrong, non-existent env var name this repo's docs used to tell people to set. Checked only to make the error message more specific -- the real SDK never reads this. */
  CLERK_PUBLISHABLE_KEY?: string;
  // Index signature so `process.env` (NodeJS.ProcessEnv, itself an index-signature
  // type with no named properties of its own) is structurally assignable here --
  // without it, TS2559 ("no properties in common") fires when passing process.env
  // directly, since an all-optional-named-properties interface with no index
  // signature isn't considered a structural match for one. Confirmed by actually
  // running `tsc --noEmit` against apps/reference-storefront, not assumed.
  [key: string]: string | undefined;
}

/**
 * Returns a clear, actionable error message when Clerk is turned on
 * (`CLERK_SECRET_KEY` set -- the same signal `lib/services.ts` and
 * `middleware.ts` use elsewhere) but the one other env var the SDK actually
 * needs, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, is missing. Returns `null`
 * when there's nothing wrong (Clerk not configured at all, or configured
 * correctly) -- callers should only act when this returns non-null.
 */
export function clerkMisconfigurationError(env: ClerkEnvLike): string | null {
  if (!env.CLERK_SECRET_KEY) return null;
  if (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;

  const wrongVarHint = env.CLERK_PUBLISHABLE_KEY
    ? ` It looks like CLERK_PUBLISHABLE_KEY is set instead -- that name is never read by @clerk/nextjs's server-side SDK (only NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is, both server- and client-side). Rename it.`
    : ``;

  return (
    `Clerk is misconfigured: CLERK_SECRET_KEY is set but NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not.` +
    wrongVarHint +
    ` Without it, clerkMiddleware() will throw MissingPublishableKeyError on every request this app's middleware matcher covers -- effectively the whole site, not just /admin. See packages/adapter-clerk/README.md.`
  );
}
