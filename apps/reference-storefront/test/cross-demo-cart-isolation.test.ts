/**
 * demo-routing-04: proves cookie namespacing genuinely isolates cart state
 * across demos in the same browser session -- the single most important
 * behavior this story exists to guarantee (design-discussion.md §2, and
 * this story's own #1 acceptance criterion). Adds an item to a cart under
 * dragon-merch and a *different* item to a cart under northline via the
 * REAL addToCartAction (never lib/services.ts's cart service directly),
 * against one shared fake cookie jar simulating a single browser holding
 * both demos' cookies at once, then renders the REAL CartPage Server
 * Component for each demo (the GET-equivalent of visiting
 * /demo/<demoSlug>/cart) and asserts each page shows only its own demo's
 * item -- not just that both demos independently work.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * A minimal fake of Next's ReadonlyRequestCookies, backed by one shared Map
 * -- simulates a single browser's cookie jar persisting across multiple
 * Server Action calls and page renders in this test, same as a real browser
 * carrying cookies from one request to the next. Real next/headers cookies()
 * throws "called outside a request scope" when invoked directly outside a
 * Next request (confirmed by hand before writing this test), so every
 * module under test that reads/writes cookies needs this mock --
 * cart-cookie.ts and coupon-cookie.ts here (via lib/actions.ts and the cart
 * page), same pattern admin-mutation-guard.test.ts uses for next/cache.
 */
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { addToCartAction } = await import("../lib/actions.js");
const { default: CartPage } = await import("../app/demo/[demoSlug]/cart/page.js");
const { getServicesForDemo } = await import("../lib/services.js");

/** Flattens a React element tree (as returned by directly calling a Server Component) to its rendered text content, without a DOM renderer -- same helper shape as admin-user-management.test.ts's own renderedText. */
function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join("");
  if (typeof node === "object" && "props" in node) {
    return renderedText((node as { props: { children?: ReactNode } }).props?.children);
  }
  return "";
}

describe("cross-demo cart cookie isolation (demo-routing-04)", () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  it("keeps dragon-merch's and northline's carts genuinely separate in the same browser session", async () => {
    // Real seeded catalog data per demo -- ids/titles are looked up, never
    // fabricated, and each demo's services graph is genuinely separate
    // (getServicesForDemo's own Map-keyed-by-demoSlug design, proven
    // elsewhere by services-demo-registry.test.ts).
    const dragonServices = await getServicesForDemo("dragon-merch");
    const northlineServices = await getServicesForDemo("northline");

    const dragonProduct = (await dragonServices.catalog.listProducts())[0];
    if (!dragonProduct) throw new Error("expected at least one seeded dragon-merch product");
    const dragonSku = (await dragonServices.catalog.listSkusByProduct(dragonProduct.id))[0];
    if (!dragonSku) throw new Error("expected at least one seeded dragon-merch SKU");

    const northlineProduct = (await northlineServices.catalog.listProducts())[0];
    if (!northlineProduct) throw new Error("expected at least one seeded northline product");
    const northlineSku = (await northlineServices.catalog.listSkusByProduct(northlineProduct.id))[0];
    if (!northlineSku) throw new Error("expected at least one seeded northline SKU");

    expect(dragonProduct.title).not.toBe(northlineProduct.title);

    // Same "browser" (same cookieJar) adds to both demos' carts via the
    // real Server Action -- exactly what browsing both demos in two tabs of
    // the same browser would do.
    const dragonForm = new FormData();
    dragonForm.set("demoSlug", "dragon-merch");
    dragonForm.set("skuId", dragonSku.id);
    dragonForm.set("quantity", "1");
    await addToCartAction(dragonForm);

    const northlineForm = new FormData();
    northlineForm.set("demoSlug", "northline");
    northlineForm.set("skuId", northlineSku.id);
    northlineForm.set("quantity", "1");
    await addToCartAction(northlineForm);

    // Both demo-namespaced cart cookies now coexist in the one shared jar,
    // with distinct cart ids -- proves the cookie NAME itself is
    // namespaced, not just its stored value.
    expect(cookieJar.has("ml_cart_id__dragon-merch")).toBe(true);
    expect(cookieJar.has("ml_cart_id__northline")).toBe(true);
    expect(cookieJar.get("ml_cart_id__dragon-merch")).not.toBe(cookieJar.get("ml_cart_id__northline"));

    // Real GET-equivalent: render each demo's real CartPage Server
    // Component against this exact same shared cookie jar.
    const dragonPage = await CartPage({ params: Promise.resolve({ demoSlug: "dragon-merch" }) });
    const northlinePage = await CartPage({ params: Promise.resolve({ demoSlug: "northline" }) });

    const dragonText = renderedText(dragonPage);
    const northlineText = renderedText(northlinePage);

    expect(dragonText).toContain(dragonProduct.title);
    expect(dragonText).not.toContain(northlineProduct.title);

    expect(northlineText).toContain(northlineProduct.title);
    expect(northlineText).not.toContain(dragonProduct.title);
  });
});
