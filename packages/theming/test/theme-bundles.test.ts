import { describe, expect, it } from "vitest";
import { createThemingService } from "../src/service.js";
import { applyTheme, getThemeBundle, THEME_BUNDLES } from "../src/theme-bundles.js";

describe("theme bundles", () => {
  it("ships exactly 7 bundles with unique keys", () => {
    expect(THEME_BUNDLES).toHaveLength(7);
    const keys = THEME_BUNDLES.map((b) => b.key);
    expect(new Set(keys).size).toBe(7);
  });

  it("every bundle has a distinct token palette -- no two bundles share identical tokens", () => {
    const serialized = THEME_BUNDLES.map((b) => JSON.stringify(b.tokens));
    expect(new Set(serialized).size).toBe(THEME_BUNDLES.length);
  });

  it("every bundle configures at least the 'pdp' page type's default template", () => {
    for (const bundle of THEME_BUNDLES) {
      expect(bundle.defaultTemplatesByPageType.pdp).toBeDefined();
    }
  });

  it("getThemeBundle looks up a bundle by key, or returns undefined", () => {
    expect(getThemeBundle("dark")?.label).toBe("Dark");
    expect(getThemeBundle("nonexistent")).toBeUndefined();
  });

  it("applyTheme is pure composition of setTokens + setDefaultTemplate -- getTokens/resolveTemplate reflect it afterward", () => {
    const theming = createThemingService();
    const bundle = getThemeBundle("dark")!;
    applyTheme(theming, bundle);

    expect(theming.getTokens()).toEqual(bundle.tokens);
    expect(theming.resolveTemplate("pdp")).toBe(bundle.defaultTemplatesByPageType.pdp);
  });

  it("switching themes is idempotent, not additive -- the second bundle fully overrides the first with no residue", () => {
    const theming = createThemingService();
    applyTheme(theming, getThemeBundle("classic")!);
    applyTheme(theming, getThemeBundle("minimal")!);

    expect(theming.getTokens()).toEqual(getThemeBundle("minimal")!.tokens);
    expect(theming.getTokens()).not.toEqual(expect.objectContaining(getThemeBundle("classic")!.tokens));
    expect(theming.resolveTemplate("pdp")).toBe(getThemeBundle("minimal")!.defaultTemplatesByPageType.pdp);
  });

  it("classic (the actual default bundle) defines the full refined token vocabulary: original 6 tokens plus muted/border colors, a 4-step spacing scale, a 3-step type scale, and a card shadow", () => {
    const classic = getThemeBundle("classic")!;
    const expectedKeys = [
      // Original six.
      "--color-background",
      "--color-text",
      "--color-primary",
      "--color-accent",
      "--font-family",
      "--radius",
      // New in the storefront-visual-redesign token vocabulary (story redesign-01).
      "--color-muted",
      "--color-border",
      "--space-xs",
      "--space-sm",
      "--space-md",
      "--space-lg",
      "--font-size-heading-lg",
      "--font-size-heading-md",
      "--font-size-body",
      "--shadow-card",
    ];

    expect(Object.keys(classic.tokens).sort()).toEqual(expectedKeys.sort());
    for (const key of expectedKeys) {
      expect(classic.tokens[key]).toBeTruthy();
    }
  });

  it("the other six bundles are untouched by the classic-only token enrichment -- none of them define the new tokens", () => {
    const untouchedKeys = ["dark", "minimal", "vibrant", "retro", "high-contrast", "northline"];
    const newTokenKeys = [
      "--color-muted",
      "--color-border",
      "--space-xs",
      "--space-sm",
      "--space-md",
      "--space-lg",
      "--font-size-heading-lg",
      "--font-size-heading-md",
      "--font-size-body",
      "--shadow-card",
    ];

    for (const key of untouchedKeys) {
      const bundle = getThemeBundle(key)!;
      expect(Object.keys(bundle.tokens)).toHaveLength(6);
      for (const newKey of newTokenKeys) {
        expect(bundle.tokens[newKey]).toBeUndefined();
      }
    }
  });

  it("northline (epic 15b's public demo bundle) applies correctly and is a real 7th bundle, not a variant of an existing one", () => {
    const theming = createThemingService();
    const northline = getThemeBundle("northline")!;
    expect(northline.label).toBe("Northline");

    applyTheme(theming, northline);
    expect(theming.getTokens()).toEqual(northline.tokens);
    expect(theming.resolveTemplate("pdp")).toBe(northline.defaultTemplatesByPageType.pdp);
  });
});
