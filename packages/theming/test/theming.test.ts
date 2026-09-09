import { describe, expect, it } from "vitest";
import { createThemingService, DEFAULT_TEMPLATES } from "../src/service.js";

describe("theming service", () => {
  it("ships at least 2 default PDP templates including tabbed-detail and long-scroll", () => {
    const theming = createThemingService();
    const pdpTemplates = theming.listTemplates("pdp");
    expect(pdpTemplates.length).toBeGreaterThanOrEqual(2);
    expect(pdpTemplates.map((t) => t.key)).toEqual(
      expect.arrayContaining(["pdp.tabbed-detail", "pdp.long-scroll"]),
    );
  });

  it("resolves to the first registered template deterministically when no override/default is set", () => {
    const theming = createThemingService();
    expect(theming.resolveTemplate("pdp")).toBe(DEFAULT_TEMPLATES[0]!.key);
    // Deterministic across repeated calls.
    expect(theming.resolveTemplate("pdp")).toBe(theming.resolveTemplate("pdp"));
  });

  it("a configured default wins over the first-registered fallback", () => {
    const theming = createThemingService();
    theming.setDefaultTemplate("pdp", "pdp.long-scroll");
    expect(theming.resolveTemplate("pdp")).toBe("pdp.long-scroll");
  });

  it("an explicit override wins over a configured default", () => {
    const theming = createThemingService();
    theming.setDefaultTemplate("pdp", "pdp.long-scroll");
    expect(theming.resolveTemplate("pdp", "pdp.tabbed-detail")).toBe("pdp.tabbed-detail");
  });

  it("returns null for a page type with no registered templates", () => {
    const theming = createThemingService();
    expect(theming.resolveTemplate("marketing")).toBeNull();
  });

  it("registerTemplate adds a template discoverable via listTemplates", () => {
    const theming = createThemingService();
    theming.registerTemplate({ key: "search.dense", pageType: "search", label: "Dense", description: "d" });
    expect(theming.listTemplates("search").map((t) => t.key)).toEqual(["search.dense"]);
  });

  it("getTokens/setTokens round-trip a style-token map", () => {
    const theming = createThemingService();
    expect(theming.getTokens()).toEqual({});
    theming.setTokens({ "--color-primary": "#c0392b" });
    expect(theming.getTokens()).toEqual({ "--color-primary": "#c0392b" });
  });

  // Acceptance criterion 1: "Given DEFAULT_TEMPLATES, then nav/home/category/cart each have
  // >=2 registered LayoutTemplates, with the template matching today's current (single)
  // layout registered FIRST for each page type."
  describe("nav/home/category/cart template registration (design-system-v2-01)", () => {
    it.each([
      ["nav", "nav.top-bar"],
      ["home", "home.standard-grid"],
      ["category", "category.standard-grid"],
      ["cart", "cart.standard"],
    ])("%s has >=2 registered templates, with %s registered first", (pageType, expectedFirstKey) => {
      const theming = createThemingService();
      const templates = theming.listTemplates(pageType);
      expect(templates.length).toBeGreaterThanOrEqual(2);
      expect(templates[0]!.key).toBe(expectedFirstKey);
    });

    it("nav also registers nav.rail", () => {
      const theming = createThemingService();
      expect(theming.listTemplates("nav").map((t) => t.key)).toEqual(
        expect.arrayContaining(["nav.top-bar", "nav.rail"]),
      );
    });

    it("home also registers home.magazine-grid and home.spec-grid", () => {
      const theming = createThemingService();
      expect(theming.listTemplates("home").map((t) => t.key)).toEqual(
        expect.arrayContaining(["home.standard-grid", "home.magazine-grid", "home.spec-grid"]),
      );
    });

    it("category also registers category.magazine-grid and category.spec-grid", () => {
      const theming = createThemingService();
      expect(theming.listTemplates("category").map((t) => t.key)).toEqual(
        expect.arrayContaining(["category.standard-grid", "category.magazine-grid", "category.spec-grid"]),
      );
    });

    it("cart also registers cart.receipt-style and cart.spec-table", () => {
      const theming = createThemingService();
      expect(theming.listTemplates("cart").map((t) => t.key)).toEqual(
        expect.arrayContaining(["cart.standard", "cart.receipt-style", "cart.spec-table"]),
      );
    });
  });

  // Acceptance criterion 3: "Given resolveTemplate('nav'), resolveTemplate('home'),
  // resolveTemplate('category'), resolveTemplate('cart') called with no bundle override,
  // then each returns the template key matching today's CURRENT behavior (proving the
  // fallback preserves existing rendering)."
  describe("resolveTemplate fallback preserves today's current behavior with no bundle override", () => {
    it.each([
      ["nav", "nav.top-bar"],
      ["home", "home.standard-grid"],
      ["category", "category.standard-grid"],
      ["cart", "cart.standard"],
    ])("resolveTemplate('%s') with no override/default returns '%s'", (pageType, expectedKey) => {
      const theming = createThemingService();
      expect(theming.resolveTemplate(pageType)).toBe(expectedKey);
      // Deterministic across repeated calls.
      expect(theming.resolveTemplate(pageType)).toBe(theming.resolveTemplate(pageType));
    });
  });
});
