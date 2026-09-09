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

beforeEach(() => {
  vi.resetModules();
});

describe("getServicesForDemo (demo-routing-01 services registry)", () => {
  it("memoizes: calling twice with the same demo slug returns the identical cached instance", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    const first = await getServicesForDemo("dragon-merch");
    const second = await getServicesForDemo("dragon-merch");

    expect(second).toBe(first);
  });

  it("isolates: two different demo slugs build two distinct instances, each starting with independently empty cart/order state", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    const dragonMerch = await getServicesForDemo("dragon-merch");
    const northline = await getServicesForDemo("northline");

    // Distinct Services objects, and distinct subsystem instances within them
    // -- not just a different seed applied to a shared graph (see
    // design-discussion.md §2: sharing one graph would let a northline
    // shopper apply a dragon-merch coupon, or an order leak across demos).
    expect(northline).not.toBe(dragonMerch);
    expect(northline.cart).not.toBe(dragonMerch.cart);
    expect(northline.checkout).not.toBe(dragonMerch.checkout);
    expect(northline.promotions).not.toBe(dragonMerch.promotions);

    // Both start with genuinely empty order state.
    expect(await dragonMerch.checkout.listOrders()).toEqual([]);
    expect(await northline.checkout.listOrders()).toEqual([]);

    // A cart created in one demo's cart service is invisible to the other's
    // -- proves the repositories are actually separate instances, not a
    // shared in-memory store keyed the same way.
    const dragonCart = await dragonMerch.cart.createCart();
    expect(await dragonMerch.cart.getCart(dragonCart.id)).not.toBeNull();
    expect(await northline.cart.getCart(dragonCart.id)).toBeNull();
  });

  it("throws a clear error for a demo slug outside the known list, rather than silently building an empty/wrong service graph", async () => {
    const { getServicesForDemo } = await import("../lib/services.js");

    expect(() => getServicesForDemo("not-a-real-demo" as DemoSlug)).toThrow(/unknown demo slug/i);
  });
});
