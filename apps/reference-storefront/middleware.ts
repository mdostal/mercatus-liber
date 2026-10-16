import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkMisconfigurationError } from "./lib/clerk-env-check";
import { isDemoSlug } from "./lib/demos";

/**
 * separate-deployed-sample-stores (epic 81, design-discussion.md §2): the
 * new single-tenant mode. `SINGLE_TENANT_DEMO_SLUG` is unset everywhere
 * that matters by default -- in particular, the existing shared Vercel
 * project aliased to commerce.mdostal.com never sets it, so
 * `resolveSingleTenantRewritePath` returns null on every call there and
 * every request it touches below is a no-op pass-through, byte-identical to
 * this file before this epic. Only a *new*, separate single-tenant
 * deployment (a later story in this same epic) sets it, to one real slug
 * from the one real registry this app already has (`lib/demos.ts`'s
 * `DEMO_SLUGS`/`isDemoSlug` -- reused here, not re-invented).
 *
 * When it IS set to a real slug, this rewrites every shopper-facing path a
 * single-tenant visitor would actually type (`/`, `/cart`, `/category/x`,
 * `/products/y`, `/admin/...`, etc.) to its real `/demo/<slug>/...`
 * equivalent *before* anything downstream -- Next's own router, and (for
 * `/admin`) the Clerk gate's own `isAdminRoute` matcher just below -- ever
 * sees the request, so the exact same `/demo/[demoSlug]/**` page tree and
 * the exact same admin-auth matcher this file already had keep running
 * completely unchanged, just against a path that's already been resolved
 * for them.
 *
 * Three families of path are deliberately left untouched even when single-
 * tenant mode is on, each for a real, confirmed reason, not a guess:
 *  - `/demo` / `/demo/...`: already demo-scoped -- rewriting it again would
 *    double-prefix it (`/demo/<slug>/demo/<slug>/...`) and 404. This is
 *    also what makes the rewrite safe to compose with a *shared* deployment
 *    that somehow had the var set by mistake: every already-`/demo/`-
 *    prefixed request (which is literally every request the shared
 *    commerce.mdostal.com deployment ever serves) still passes through
 *    unrewritten.
 *  - `/api` / `/api/...`: this app's one real API route,
 *    `app/api/demo/[demoSlug]/copilot/route.ts`, already takes its own
 *    demoSlug as an explicit path segment, and the one real client call
 *    site (`CopilotChat.tsx`) already fetches
 *    `` `/api/demo/${demoSlug}/copilot` `` using whatever demoSlug it was
 *    rendered with -- under single-tenant mode that's already the single
 *    tenant's real slug (it came from the rewritten page's own
 *    `params.demoSlug`), so the request already arrives correctly shaped.
 *    Rewriting it again here would turn it into
 *    `/demo/<slug>/api/demo/<slug>/copilot`, which doesn't exist, and would
 *    break the one real API route this app has.
 *  - `/trpc` / `/trpc/...` and `/__clerk` / `/__clerk/...`: no `/trpc` route
 *    exists in this app (confirmed: `app/` has only `demo/`, `api/`, and
 *    the `(landing)` group) -- `/trpc` is matched below purely because the
 *    `config.matcher` array already (defensively) includes it, same as
 *    `/__clerk`, Clerk's own real internal path (see that matcher entry's
 *    own history). Both are excluded here for the same reason `/api` is:
 *    they're not shopper-facing demo content, and prefixing either would
 *    only ever break something, never fix anything.
 */
const SINGLE_TENANT_EXCLUDED_PREFIXES = ["/demo", "/api", "/trpc", "/__clerk"];

function resolveSingleTenantRewritePath(pathname: string): string | null {
  const slug = process.env.SINGLE_TENANT_DEMO_SLUG;
  if (!slug || !isDemoSlug(slug)) return null;
  if (SINGLE_TENANT_EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }
  return pathname === "/" ? `/demo/${slug}` : `/demo/${slug}${pathname}`;
}

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
  // separate-deployed-sample-stores (epic 81): resolve single-tenant mode
  // and mutate `req.nextUrl.pathname` IN PLACE, before isAdminRoute(req)
  // below ever reads it. `req` here is the exact same NextRequest instance
  // the outer `middleware` function below was called with for this one
  // request -- never reused across requests -- so this mutation is purely
  // local to resolving this one request, and (per @clerk/nextjs@7.9.4's own
  // routeMatcher.js: `matcher(req.nextUrl.pathname)`) is exactly what makes
  // the real, unmodified isAdminRoute matcher below see a single-tenant
  // visitor's typed `/admin/...` path as the `/demo/<slug>/admin/...` path
  // it actually is, with zero change to the matcher itself. When
  // SINGLE_TENANT_DEMO_SLUG is unset (every deployment except a future
  // single-tenant one), resolveSingleTenantRewritePath always returns null
  // and this is a no-op -- req.nextUrl.pathname is never touched.
  const singleTenantRewrite = resolveSingleTenantRewritePath(req.nextUrl.pathname);
  if (singleTenantRewrite) {
    req.nextUrl.pathname = singleTenantRewrite;
  }

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

  // Not gated, or gated and auth.protect() didn't throw -- if single-tenant
  // mode rewrote this request above, Next still needs to be told to
  // actually serve the rewritten path (mutating req.nextUrl.pathname only
  // changed what the matcher saw, not what the router renders). Returning
  // this NextResponse directly from inside clerkMiddleware's own handler --
  // rather than discarding clerkAdminGate's result and building a second,
  // separate NextResponse.rewrite() out in the outer `middleware` function
  // below -- keeps the bookkeeping clerkMiddleware itself does on whatever
  // this handler returns (appending requestState.headers, decorateRequest(),
  // etc. -- see @clerk/nextjs@7.9.4's own runHandlerWithRequestState in
  // clerkMiddleware.js: `handlerResult = userHandlerResult || handlerResult`)
  // intact, so Clerk's own auth-state headers still ride along on the
  // rewritten response exactly as they would on its own default
  // NextResponse.next(). If auth.protect() above threw (unauthenticated),
  // this line is never reached -- Clerk's own try/catch around calling this
  // handler converts that throw into a sign-in redirect before coming back
  // here, same as it always has.
  if (singleTenantRewrite) {
    return NextResponse.rewrite(req.nextUrl);
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
    // clerkAdminGate (and the single-tenant rewrite it carries, see its own
    // doc comment above) never runs in this branch, so single-tenant mode
    // has to be resolved here too -- same resolveSingleTenantRewritePath
    // call, same no-op-when-unset guarantee, just without Clerk in the loop
    // (exactly this app's real local-development default, per this
    // function's own doc comment below).
    const singleTenantRewrite = resolveSingleTenantRewritePath(request.nextUrl.pathname);
    if (singleTenantRewrite) {
      request.nextUrl.pathname = singleTenantRewrite;
      return NextResponse.rewrite(request.nextUrl);
    }
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
 *
 * This same matcher is also exactly what the single-tenant rewrite above
 * needs to run on -- it already covers `/`, `/cart`, `/category/x`,
 * `/products/y`, etc. (any shopper-facing route with no `/demo/` prefix),
 * so SINGLE_TENANT_DEMO_SLUG required no matcher change, only the two
 * resolveSingleTenantRewritePath call sites above.
 */
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
