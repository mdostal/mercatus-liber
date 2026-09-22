import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkMisconfigurationError } from "./lib/clerk-env-check";

/**
 * admin-auth-03: authentication layer (design-discussion.md §3). Scoped to
 * every /demo/<demoSlug>/admin path -- authorization (which role can do what)
 * is a separate, second layer handled by app/demo/[demoSlug]/admin/layout.tsx
 * and each mutation action's own requireAdminPermission() guard in
 * lib/actions.ts, not here.
 *
 * demo-routing-03 moved the whole admin tree from the bare app/admin to
 * app/demo/[demoSlug]/admin (design-discussion.md §3: "a print-shop admin
 * session has no business seeing northline's promotions"). The old
 * `/admin(.*)` pattern is replaced outright, not supplemented -- app/admin no
 * longer exists at the app root after that move, so a route matching only
 * the old bare pattern would never fire, and leaving it in would be
 * misleading dead config rather than real defense-in-depth. `:demoSlug`
 * matches exactly one path segment (any known or unknown slug -- an unknown
 * one 404s downstream via each page's own isDemoSlug guard, same as an
 * unauthenticated session 404s/redirects here), consistent with this app's
 * demo-registry-driven routing (lib/demos.ts).
 *
 * `createRouteMatcher` is flagged deprecated in @clerk/nextjs@7.9.1's own
 * type defs (node_modules/.../\@clerk/nextjs/dist/types/server/routeMatcher.d.ts)
 * in favor of resource-based auth checks -- but it remains fully functional
 * and is the only route-matching primitive clerkMiddleware() exposes. The
 * resource-based check the deprecation notice recommends is exactly what
 * app/demo/[demoSlug]/admin/layout.tsx's own adminAuth.getCurrentSession()
 * call provides, so this middleware's job stays narrow: gate authentication
 * for /demo/<demoSlug>/admin, leave every other route untouched.
 */
const isAdminRoute = createRouteMatcher(["/demo/:demoSlug/admin(.*)"]);

const clerkAdminGate: NextMiddleware = clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    // No session -> auth.protect() redirects to Clerk's sign-in flow. No
    // unauthenticatedUrl override is passed here, so Clerk's own default
    // applies: createMiddlewareRedirectToSignIn (in @clerk/nextjs's
    // clerkMiddleware.js) builds returnBackUrl from the full original
    // request URL whenever it isn't explicitly overridden (see
    // buildReturnBackUrl in nextErrors.js: `returnBackUrl || url`) -- so the
    // sign-in redirect already carries this exact /demo/<demoSlug>/admin/...
    // path (demoSlug included, since it's part of the path itself, not a
    // separate param) as its own `redirect_url`, and Clerk's hosted sign-in
    // flow returns the visitor to that same URL after authenticating. No
    // extra demoSlug-threading code is needed here for that to work; this
    // reference-storefront app doesn't configure a custom sign-in URL
    // (CLERK_SIGN_IN_URL/signInUrl) at all, so this default path is exactly
    // what's live in this app today, confirmed by reading protect.js's
    // handleUnauthenticated() -> redirectToSignIn() call (no options passed).
    //
    // Session present but the role check fails -> that's lib/actions.ts's
    // and app/demo/[demoSlug]/admin/layout.tsx's job, not middleware's
    // (middleware can't cleanly express "logged in as viewer, blocked from
    // mutating").
    await auth.protect();
  }
});

/**
 * clerkMiddleware() unconditionally throws MissingPublishableKeyError /
 * MissingSecretKeyError the instant any matched request comes in -- verified
 * by reading @clerk/nextjs@7.9.1's own clerkMiddleware.js source
 * (`assertKey(...)` calls at the top of its per-request handler), not
 * assumed. That would break every route this file's broad matcher covers
 * (not just /demo/<demoSlug>/admin) whenever this app runs with the
 * dev-default adminAuth adapter (no CLERK_SECRET_KEY) -- exactly the
 * local-development mode this story's acceptance criteria require to keep
 * working with zero live Clerk account. So Clerk's middleware only actually
 * engages once CLERK_SECRET_KEY is set (the same signal lib/services.ts uses
 * to choose the real Clerk adapter); otherwise every request passes straight
 * through, and app/demo/[demoSlug]/admin/layout.tsx's own
 * adminAuth.getCurrentSession() check (the dev default, in that case) is the
 * sole /demo/<demoSlug>/admin gate for local development.
 */
const middleware: NextMiddleware = (request: NextRequest, event: NextFetchEvent) => {
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  // admin-auth-clerk-live: fail loud and specific, before ever calling
  // clerkMiddleware(), for the exact real misconfiguration that caused this
  // app's disclosed "/admin regression" (epic-backlog.md row 56) -- see
  // lib/clerk-env-check.ts's own doc comment for the full root-cause
  // writeup. Clerk's own MissingPublishableKeyError is real and would fire
  // here anyway, but its text doesn't call out this repo's specific wrong-
  // env-var-name history, so this surfaces first with an actionable message.
  const misconfiguration = clerkMisconfigurationError(process.env);
  if (misconfiguration) {
    throw new Error(misconfiguration);
  }
  return clerkAdminGate(request, event);
};

export default middleware;

/**
 * Clerk's own currently-documented recommended matcher (fetched fresh from
 * clerk.com/docs/reference/nextjs/clerk-middleware for this story) -- runs
 * this file on every route except static assets and Clerk's own internal
 * paths, but the handler above only ever calls auth.protect() for
 * /demo/<demoSlug>/admin/*, so every shopper-facing route (/, /demo/<demoSlug>
 * /products/*, /demo/<demoSlug>/cart, /demo/<demoSlug>/checkout,
 * /demo/<demoSlug>/search, /demo/<demoSlug>/campaign/*,
 * /demo/<demoSlug>/locations/*, /demo/<demoSlug>/account) passes through
 * untouched, with zero behavior change from before this story.
 */
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
