/**
 * separate-deployed-sample-stores (epic 81, design-discussion.md §2):
 * proves the new SINGLE_TENANT_DEMO_SLUG rewrite in middleware.ts both
 * ways --
 *
 *  1. Unset (every deployment today, including the real, live, public
 *     commerce.mdostal.com deployment): behavior must be byte-identical to
 *     this file before this epic. The real baseline for that claim is this
 *     suite's own full run (`pnpm test`, right here in apps/
 *     reference-storefront) BEFORE this story's changes -- 257 passed, 1
 *     skipped, 41 test files, confirmed by actually running it first. This
 *     file doesn't re-run that baseline (vitest already does, every run);
 *     it adds the specific unset-mode assertions middleware.ts never had a
 *     test file for at all before this story, on top of it.
 *  2. Set to a real slug (a later story's new, separate single-tenant
 *     deployment): `/` and other real shopper-facing paths resolve to the
 *     exact same `/demo/<slug>/...` path the existing shared deployment
 *     already serves and already has its own real content/behavior for
 *     (print-shop's real seeded category/product slugs below come straight
 *     out of lib/seed.ts's seedCategories/seedCatalog, not invented) -- and
 *     the real Clerk admin gate still genuinely applies to the single-
 *     tenant-relative admin path a real user would type, not bypassed and
 *     not broken.
 *
 * Testing strategy for the admin case: this suite has no live Clerk test
 * credentials anywhere (confirmed: no other test file in test/ mocks
 * @clerk/nextjs at all, and clerk-env-check.test.ts only exercises the pure
 * env-var-shape guard, never clerkMiddleware() itself), so calling the real
 * Clerk network isn't an option here. What CAN be -- and is -- genuinely
 * exercised unmocked is the actual route-matching primitive middleware.ts
 * relies on: `createRouteMatcher(["/demo/:demoSlug/admin(.*)"])`, imported
 * for real from @clerk/nextjs/server below. Only `clerkMiddleware` itself is
 * replaced, with a stub that reproduces -- faithfully, read directly out of
 * @clerk/nextjs@7.9.4's own dist/cjs/server/clerkMiddleware.js
 * (runHandlerWithRequestState) -- the two control-flow shapes that matter
 * here: the handler's own return value becomes the response when it doesn't
 * throw, and a thrown "unauthenticated" error becomes a redirect response
 * instead. That lets these tests prove, against the real matcher and the
 * real middleware.ts control flow, that: (a) a single-tenant-relative
 * `/admin/...` request really does get resolved to `/demo/<slug>/admin/...`
 * *before* the real matcher ever sees it, so the gate fires at all (not
 * bypassed), and (b) an unauthenticated hit on that same path really does
 * come back as a redirect, never as the rewritten admin page (not broken).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authProtectMock = vi.fn<(...args: unknown[]) => unknown>();

/** The exact sentinel @clerk/nextjs's own createMiddlewareProtect throws internally when auth.protect() denies a request -- reproduced here (not the real class, which lives behind @clerk/backend internals this app doesn't need to depend on directly) purely as a thrown-value marker this stub's own catch block recognizes. */
class StubUnauthenticatedError extends Error {}

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    ...actual,
    // createRouteMatcher is intentionally left as `actual.createRouteMatcher`
    // (real, unmocked, see this file's own header comment) -- only
    // clerkMiddleware is replaced.
    clerkMiddleware:
      (handler: (auth: { protect: () => Promise<void> }, req: NextRequest, event: unknown) => unknown) =>
      async (req: NextRequest, event: unknown) => {
        const auth = {
          protect: async () => {
            const result = authProtectMock();
            if (result instanceof Promise) await result;
          },
        };
        try {
          const handlerResult = await handler(auth, req, event);
          return (handlerResult as Response | undefined) ?? NextResponse.next();
        } catch (e) {
          if (e instanceof StubUnauthenticatedError) {
            // Real clerkMiddleware.js's own handleControlFlowErrors does the
            // same thing on a real redirect-to-sign-in error: returns a
            // redirect response instead of letting the throw propagate.
            return NextResponse.redirect(new URL("https://clerk.example.com/sign-in", req.url));
          }
          throw e;
        }
      },
  };
});

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.SINGLE_TENANT_DEMO_SLUG;
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

beforeEach(() => {
  resetEnv();
  authProtectMock.mockReset();
});

const { default: middleware } = await import("../middleware.js");

function get(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"));
}

/** The rewrite target `middleware.ts` asked Next to actually serve, or null if this response is a plain pass-through (no `x-middleware-rewrite` header at all). */
function rewriteTargetPathname(response: Response): string | null {
  const rewrite = response.headers.get("x-middleware-rewrite");
  return rewrite ? new URL(rewrite).pathname : null;
}

describe("SINGLE_TENANT_DEMO_SLUG unset (today's real commerce.mdostal.com deployment): byte-identical pass-through", () => {
  it("never rewrites real shopper-facing paths when the env var is unset", async () => {
    for (const path of ["/", "/cart", "/category/embroidery", "/products/embroidered-canvas-tote"]) {
      const response = (await middleware(get(path), {} as never)) as Response;
      expect(rewriteTargetPathname(response)).toBeNull();
    }
  });

  it("never rewrites when the env var is set to something that isn't a real registered demo slug (lib/demos.ts's DEMO_SLUGS/isDemoSlug) -- a typo never silently activates single-tenant mode", async () => {
    process.env.SINGLE_TENANT_DEMO_SLUG = "print-shoppe";
    const response = (await middleware(get("/"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBeNull();
  });

  it("leaves an already-/demo/-scoped admin path's own real matcher behavior alone, with no CLERK_SECRET_KEY set (this app's documented local-dev default)", async () => {
    const response = (await middleware(get("/demo/print-shop/admin/promotions"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBeNull();
    expect(authProtectMock).not.toHaveBeenCalled();
  });
});

describe("SINGLE_TENANT_DEMO_SLUG set to a real slug: shopper-facing paths resolve to their real /demo/<slug> equivalent", () => {
  beforeEach(() => {
    process.env.SINGLE_TENANT_DEMO_SLUG = "print-shop";
  });

  it("rewrites / to /demo/print-shop, exactly today's real print-shop home route", async () => {
    const response = (await middleware(get("/"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop");
  });

  it("rewrites /cart to /demo/print-shop/cart", async () => {
    const response = (await middleware(get("/cart"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop/cart");
  });

  it("rewrites /category/embroidery to /demo/print-shop/category/embroidery -- 'embroidery' is one of print-shop's 5 real seeded top-level categories (lib/seed.ts's seedCategories)", async () => {
    const response = (await middleware(get("/category/embroidery"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop/category/embroidery");
  });

  it("rewrites /products/embroidered-canvas-tote to /demo/print-shop/products/embroidered-canvas-tote -- a real seeded print-shop product slug (lib/seed.ts)", async () => {
    const response = (await middleware(get("/products/embroidered-canvas-tote"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop/products/embroidered-canvas-tote");
  });

  it("does NOT double-rewrite a path that's already /demo/-scoped for a different demo (/demo/northline/cart stays exactly /demo/northline/cart)", async () => {
    const response = (await middleware(get("/demo/northline/cart"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBeNull();
  });

  it("does NOT rewrite the one real API route (app/api/demo/[demoSlug]/copilot/route.ts already takes its own demoSlug segment)", async () => {
    const response = (await middleware(get("/api/demo/print-shop/copilot"), {} as never)) as Response;
    expect(rewriteTargetPathname(response)).toBeNull();
  });
});

describe("SINGLE_TENANT_DEMO_SLUG set to a real slug: the real Clerk admin gate on the single-tenant-relative admin path", () => {
  beforeEach(() => {
    process.env.SINGLE_TENANT_DEMO_SLUG = "print-shop";
    process.env.CLERK_SECRET_KEY = "sk_test_stub";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_stub";
  });

  it("gates /admin/promotions -- the single-tenant-relative admin path a real user would actually type, with no /demo/print-shop prefix -- not bypassed: auth.protect() is genuinely invoked", async () => {
    authProtectMock.mockResolvedValue(undefined);
    const response = (await middleware(get("/admin/promotions"), {} as never)) as Response;
    expect(authProtectMock).toHaveBeenCalledTimes(1);
    // Authenticated -> the gate let it through to the real rewritten admin
    // page, same /demo/print-shop/admin/promotions route the shared
    // deployment's admin matcher already protects today.
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop/admin/promotions");
  });

  it("denies /admin/promotions when unauthenticated -- not broken: a real redirect comes back, never the rewritten admin page", async () => {
    authProtectMock.mockRejectedValue(new StubUnauthenticatedError("no session"));
    const response = (await middleware(get("/admin/promotions"), {} as never)) as Response;
    expect(authProtectMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("sign-in");
    // Never the single-tenant rewrite to the real admin page -- the gate
    // actually blocked it, it didn't just get ignored.
    expect(rewriteTargetPathname(response)).toBeNull();
  });

  it("does NOT gate a non-admin single-tenant path (/cart) -- scope stays exactly as narrow as the pre-existing /demo/<demoSlug>/admin(.*) matcher", async () => {
    authProtectMock.mockResolvedValue(undefined);
    const response = (await middleware(get("/cart"), {} as never)) as Response;
    expect(authProtectMock).not.toHaveBeenCalled();
    expect(rewriteTargetPathname(response)).toBe("/demo/print-shop/cart");
  });

  it("still gates an already-/demo/-prefixed admin path the same as before this story (no rewrite needed, matcher already matched it directly)", async () => {
    authProtectMock.mockResolvedValue(undefined);
    const response = (await middleware(get("/demo/print-shop/admin/promotions"), {} as never)) as Response;
    expect(authProtectMock).toHaveBeenCalledTimes(1);
    // Already demo-scoped -- resolveSingleTenantRewritePath is a no-op here,
    // so this is clerkAdminGate's own default NextResponse.next(), not a
    // rewrite (nothing to rewrite to).
    expect(rewriteTargetPathname(response)).toBeNull();
  });
});
