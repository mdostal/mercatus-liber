/**
 * scc-04: proves resolvePageTemplateOverride (lib/resolve-page-template.ts)
 * -- the shared precedence every real render call site (layout.tsx, home
 * page.tsx, category/[slug]/page.tsx, cart/page.tsx, products/[slug]/
 * page.tsx, site/[viewSlug]/page.tsx) now uses -- actually composes the
 * content-layout dashboard's per-page-type admin override with the
 * whole-bundle /themes picker correctly:
 *   1. An explicit per-request override (PDP's own `?template=`) always wins.
 *   2. Else this dashboard's own per-page-type admin override
 *      (ThemingService.setDefaultTemplate, read back via
 *      getConfiguredDefault) wins over the active theme bundle's own pick.
 *   3. Else the active theme bundle's own pick (unchanged /themes behavior).
 *   4. Else resolveTemplate's own first-registered-template fallback.
 */
import { describe, expect, it } from "vitest";
import { createThemingService } from "@mercatus-liber/theming";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { resolvePageTemplateKey, resolvePageTemplateOverride } from "../lib/resolve-page-template.js";

function bundleWith(defaultTemplatesByPageType: Record<string, string>): ThemeBundle {
  return { key: "test-bundle", label: "Test Bundle", tokens: {}, defaultTemplatesByPageType };
}

describe("resolvePageTemplateOverride / resolvePageTemplateKey (scc-04 composition)", () => {
  it("falls back to the bundle's own pick when there is no admin override (today's exact pre-existing /themes behavior)", () => {
    const theming = createThemingService();
    const bundle = bundleWith({ pdp: "pdp.long-scroll" });

    expect(resolvePageTemplateKey(theming, "pdp", bundle)).toBe("pdp.long-scroll");
  });

  it("falls back to resolveTemplate's first-registered default when neither an admin override nor the bundle define one", () => {
    const theming = createThemingService();
    const bundle = bundleWith({}); // e.g. "classic" and 6 other pre-existing bundles for nav/home/category/cart

    expect(resolvePageTemplateKey(theming, "home", bundle)).toBe("home.standard-grid");
    expect(resolvePageTemplateKey(theming, "nav", bundle)).toBe("nav.top-bar");
    expect(resolvePageTemplateKey(theming, "category", bundle)).toBe("category.standard-grid");
    expect(resolvePageTemplateKey(theming, "cart", bundle)).toBe("cart.standard");
  });

  it("an admin's per-page-type override wins over the active bundle's own pick for that page type", () => {
    const theming = createThemingService();
    const bundle = bundleWith({ pdp: "pdp.long-scroll" });

    // Content-layout dashboard's setPageTemplateAction ultimately calls this.
    theming.setDefaultTemplate("pdp", "pdp.spec-sheet");

    expect(resolvePageTemplateKey(theming, "pdp", bundle)).toBe("pdp.spec-sheet");
  });

  it("an admin override is scoped to its own page type -- it does not leak into other page types the bundle still controls", () => {
    const theming = createThemingService();
    const bundle = bundleWith({ pdp: "pdp.long-scroll", home: "home.magazine-grid" });

    theming.setDefaultTemplate("pdp", "pdp.spec-sheet");

    expect(resolvePageTemplateKey(theming, "pdp", bundle)).toBe("pdp.spec-sheet");
    // "home" has no admin override -- the bundle's own pick still wins, proving
    // the whole-bundle picker keeps working unchanged for every page type an
    // admin hasn't independently overridden.
    expect(resolvePageTemplateKey(theming, "home", bundle)).toBe("home.magazine-grid");
  });

  it("a genuinely per-request explicit override (PDP's own ?template=) still wins over an admin's stored default", () => {
    const theming = createThemingService();
    const bundle = bundleWith({ pdp: "pdp.long-scroll" });
    theming.setDefaultTemplate("pdp", "pdp.spec-sheet");

    expect(resolvePageTemplateOverride(theming, "pdp", bundle, "pdp.tabbed-detail")).toBe("pdp.tabbed-detail");
  });

  it("clearing back to the bundle's pick is as simple as never having set an admin override -- switching demos'/bundles' picks is unaffected by an unrelated page type's override", () => {
    const theming = createThemingService();
    theming.setDefaultTemplate("cart", "cart.receipt-style");

    const bundleA = bundleWith({ pdp: "pdp.tabbed-detail" });
    const bundleB = bundleWith({ pdp: "pdp.long-scroll" });

    // Switching the whole-bundle /themes pick still changes "pdp" freely --
    // the "cart" admin override doesn't interfere with an unrelated page type.
    expect(resolvePageTemplateKey(theming, "pdp", bundleA)).toBe("pdp.tabbed-detail");
    expect(resolvePageTemplateKey(theming, "pdp", bundleB)).toBe("pdp.long-scroll");
    expect(resolvePageTemplateKey(theming, "cart", bundleA)).toBe("cart.receipt-style");
    expect(resolvePageTemplateKey(theming, "cart", bundleB)).toBe("cart.receipt-style");
  });
});
