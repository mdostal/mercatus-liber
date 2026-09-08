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
});
