import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * admin-auth-03: authentication layer (design-discussion.md §3). Scoped to
 * /admin and every /admin/* path -- authorization (which role can do what)
 * is a separate, second layer handled by app/admin/layout.tsx and each
 * mutation action's own requireAdminPermission() guard in lib/actions.ts,
 * not here.
 *
 * `createRouteMatcher` is flagged deprecated in @clerk/nextjs@7.9.1's own
 * type defs (node_modules/.../\@clerk/nextjs/dist/types/server/routeMatcher.d.ts)
 * in favor of resource-based auth checks -- but it remains fully functional
 * and is the only route-matching primitive clerkMiddleware() exposes. The
 * resource-based check the deprecation notice recommends is exactly what
 * app/admin/layout.tsx's own adminAuth.getCurrentSession() call provides,
 * so this middleware's job stays narrow: gate authentication for /admin,
 * leave every other route untouched.
 */
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const clerkAdminGate: NextMiddleware = clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    // No session -> auth.protect() redirects to Clerk's sign-in flow.
    // Session present but the role check fails -> that's lib/actions.ts's
    // and app/admin/layout.tsx's job, not middleware's (middleware can't
    // cleanly express "logged in as viewer, blocked from mutating").
    await auth.protect();
  }
});

/**
 * clerkMiddleware() unconditionally throws MissingPublishableKeyError /
 * MissingSecretKeyError the instant any matched request comes in -- verified
 * by reading @clerk/nextjs@7.9.1's own clerkMiddleware.js source
 * (`assertKey(...)` calls at the top of its per-request handler), not
 * assumed. That would break every route this file's broad matcher covers
 * (not just /admin) whenever this app runs with the dev-default adminAuth
 * adapter (no CLERK_SECRET_KEY) -- exactly the local-development mode this
 * story's acceptance criteria require to keep working with zero live Clerk
 * account. So Clerk's middleware only actually engages once CLERK_SECRET_KEY
 * is set (the same signal lib/services.ts uses to choose the real Clerk
 * adapter); otherwise every request passes straight through, and
 * app/admin/layout.tsx's own adminAuth.getCurrentSession() check (the dev
 * default, in that case) is the sole /admin gate for local development.
 */
const middleware: NextMiddleware = (request: NextRequest, event: NextFetchEvent) => {
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  return clerkAdminGate(request, event);
};

export default middleware;

/**
 * Clerk's own currently-documented recommended matcher (fetched fresh from
 * clerk.com/docs/reference/nextjs/clerk-middleware for this story) -- runs
 * this file on every route except static assets and Clerk's own internal
 * paths, but the handler above only ever calls auth.protect() for
 * /admin/*, so every shopper-facing route (/, /products/*, /cart,
 * /checkout, /search, /campaign/*, /locations/*, /account) passes through
 * untouched, with zero behavior change from before this story.
 */
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
