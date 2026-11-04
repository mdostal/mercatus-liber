/**
 * demo-routing-01: proves lib/services.ts's Map-keyed getServicesForDemo
 * replaces the old module-scoped singleton correctly -- see
 * .pHive/epics/commerce-landing-and-demo-routing/stories/demo-routing-01-services-and-registry.yaml's
 * acceptance criteria:
 *   - the same demo slug called twice is memoized (identical instance)
 *   - two different demo slugs build two DISTINCT, independently-stateful
 *     instances (separate cart/order state, not just separate seed data --
 *     see design-discussion.md §2 on why the whole graph must be duplicated)
 *   - an unknown demo slug throws a clear error rather than silently
 *     building an empty/wrong service graph
 *
 * vi.resetModules() before each import is required because
 * getServicesForDemo memoizes per demo slug in a module-scoped Map --
 * without a fresh module instance per test, later tests would just observe
 * earlier tests' cached Services instances.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoSlug } from "../lib/demos.js";
import { __resetServicesCacheForTests } from "../lib/services.js";

beforeEach(() => {
  vi.resetModules();
  __resetServicesCacheForTests();
});

describe("getServicesForDemo (demo-routing-01 services registry)", () => {
  it("memoizes: calling twice with the same demo slug returns the identical cached instance", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    const first = await getServicesForDemo("print-shop");
    const second = await getServicesForDemo("print-shop");

    expect(second).toBe(first);
  });

  it("isolates: two different demo slugs build two distinct instances, each starting with independently empty cart/order state", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    const printShop = await getServicesForDemo("print-shop");
    const northline = await getServicesForDemo("northline");

    // Distinct Services objects, and distinct subsystem instances within them
    // -- not just a different seed applied to a shared graph (see
    // design-discussion.md §2: sharing one graph would let a northline
    // shopper apply a print-shop coupon, or an order leak across demos).
    expect(northline).not.toBe(printShop);
    expect(northline.cart).not.toBe(printShop.cart);
    expect(northline.checkout).not.toBe(printShop.checkout);
    expect(northline.promotions).not.toBe(printShop.promotions);

    // Both start with genuinely empty order state.
    expect(await printShop.checkout.listOrders()).toEqual([]);
    expect(await northline.checkout.listOrders()).toEqual([]);

    // A cart created in one demo's cart service is invisible to the other's
    // -- proves the repositories are actually separate instances, not a
    // shared in-memory store keyed the same way.
    const printShopCart = await printShop.cart.createCart();
    expect(await printShop.cart.getCart(printShopCart.id)).not.toBeNull();
    expect(await northline.cart.getCart(printShopCart.id)).toBeNull();
  });

  it("throws a clear error for a demo slug outside the known list, rather than silently building an empty/wrong service graph", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    expect(() => getServicesForDemo("not-a-real-demo" as DemoSlug)).toThrow(/unknown demo slug/i);
  });

  /**
   * community-goals-storefront-wiring: a real, confirmed-live bug (found
   * verifying against a `next start` production build, not a dev-only
   * artifact) -- Next.js's App Router bundles Route Handlers into their OWN
   * module graph, separate from the Server Action/page-render bundle, so a
   * plain module-scoped `const servicesByDemo = new Map()` gets a genuinely
   * separate instance per bundle even inside the same long-running Node
   * process: a goal created via the admin page's Server Action was
   * invisible to a Route Handler reading the "same" demo's services right
   * after. Fixed by pinning the Map onto `globalThis` (lib/services.ts).
   * `vi.resetModules()` + a fresh dynamic import is this test's proxy for
   * "a separate bundle re-evaluates lib/services.ts's module scope" -- the
   * two tests above (memoizes/isolates) never reset modules between their
   * two getServicesForDemo calls, so neither would have caught this; this
   * one specifically forces a fresh module instance between the write and
   * the read, the same shape of gap the real bug had.
   */
  it("survives a fresh module re-evaluation (globalThis-pinned, not a plain module-scoped Map) -- proxies the real Route-Handler-vs-page bundle split", async () => {
    const { getServicesForDemo: getServicesForDemoFirstInstance } = await import("../lib/services.js");
    const first = await getServicesForDemoFirstInstance("print-shop");
    const created = await first.goals.createGoal({ slug: "cross-bundle-goal", title: "T", description: "", targetCount: 5 });

    // Deliberately NOT calling __resetServicesCacheForTests() here -- that
    // would wipe the very globalThis-pinned state this test exists to
    // prove survives a fresh module re-evaluation. Only vi.resetModules()
    // (clears the module REGISTRY, forcing the next import() to
    // re-evaluate lib/services.ts's module scope from scratch) belongs
    // here; see this test's own doc comment above.
    vi.resetModules();

    const { getServicesForDemo: getServicesForDemoSecondInstance } = await import("../lib/services.js");
    const second = await getServicesForDemoSecondInstance("print-shop");
    const foundFromFreshInstance = await second.goals.getGoal(created.id);

    expect(foundFromFreshInstance?.slug).toBe("cross-bundle-goal");
  });
});
