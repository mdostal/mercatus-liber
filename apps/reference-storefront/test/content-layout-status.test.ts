/**
 * scc-04: proves getContentLayoutStatus (lib/content-layout-status.ts) --
 * the content-layout dashboard's "computed-fresh-per-subsystem status row"
 * (mirroring lib/adapter-info.ts's own convention) -- reports both an
 * admin's own per-page-type override AND the genuinely live-effective
 * template (bundle + admin override composed), not just one or the other.
 */
import { describe, expect, it } from "vitest";
import { createThemingService } from "@mercatus-liber/theming";
import type { ThemeBundle } from "@mercatus-liber/theming";
import { CONTENT_LAYOUT_PAGE_TYPES, getContentLayoutStatus } from "../lib/content-layout-status.js";

function bundleWith(defaultTemplatesByPageType: Record<string, string>): ThemeBundle {
  return { key: "test-bundle", label: "Test Bundle", tokens: {}, defaultTemplatesByPageType };
}

describe("getContentLayoutStatus (scc-04)", () => {
  it("returns exactly one row per registered content-layout page type (nav/home/category/cart/pdp)", () => {
    const theming = createThemingService();
    const rows = getContentLayoutStatus(theming, bundleWith({}));
    expect(rows.map((r) => r.pageType)).toEqual(CONTENT_LAYOUT_PAGE_TYPES.map((p) => p.pageType));
  });

  it("adminOverrideKey is null and liveTemplateKey follows the bundle when no admin override is set", () => {
    const theming = createThemingService();
    const rows = getContentLayoutStatus(theming, bundleWith({ pdp: "pdp.long-scroll" }));
    const pdpRow = rows.find((r) => r.pageType === "pdp")!;

    expect(pdpRow.adminOverrideKey).toBeNull();
    expect(pdpRow.liveTemplateKey).toBe("pdp.long-scroll");
    expect(pdpRow.liveTemplateLabel).toBe("Long Scroll");
  });

  it("adminOverrideKey and liveTemplateKey both reflect a configured admin override, winning over the bundle", () => {
    const theming = createThemingService();
    theming.setDefaultTemplate("pdp", "pdp.spec-sheet");
    const rows = getContentLayoutStatus(theming, bundleWith({ pdp: "pdp.long-scroll" }));
    const pdpRow = rows.find((r) => r.pageType === "pdp")!;

    expect(pdpRow.adminOverrideKey).toBe("pdp.spec-sheet");
    expect(pdpRow.liveTemplateKey).toBe("pdp.spec-sheet");
    expect(pdpRow.liveTemplateLabel).toBe("Spec Sheet");
  });

  it("every row's templates array matches theming.listTemplates(pageType) exactly", () => {
    const theming = createThemingService();
    const rows = getContentLayoutStatus(theming, bundleWith({}));
    for (const row of rows) {
      expect(row.templates).toEqual(theming.listTemplates(row.pageType));
    }
  });
});
