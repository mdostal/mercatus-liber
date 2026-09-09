import { describe, expect, it } from "vitest";
import { createThemingService } from "../src/service.js";
import { applyTheme, getThemeBundle, THEME_BUNDLES } from "../src/theme-bundles.js";

describe("theme bundles", () => {
  it("ships exactly 10 bundles with unique keys (7 pre-existing + 3 new: editorial/maximalist/datasheet)", () => {
    expect(THEME_BUNDLES).toHaveLength(10);
    const keys = THEME_BUNDLES.map((b) => b.key);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toEqual(
      expect.arrayContaining(["editorial", "maximalist", "datasheet"]),
    );
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

  // Acceptance criterion 2: the 7 pre-existing bundles set no explicit default for
  // nav/home/category/cart, so applying any of them leaves resolveTemplate() falling back
  // to today's current behavior for those page types -- proving story 1 required zero edits
  // to the 7 pre-existing bundles for backward compatibility.
  describe("the 7 pre-existing bundles inherit today's current nav/home/category/cart behavior unchanged", () => {
    const preExistingKeys = ["classic", "dark", "minimal", "vibrant", "retro", "high-contrast", "northline"];

    it.each(preExistingKeys)("%s sets no explicit default for nav/home/category/cart", (key) => {
      const bundle = getThemeBundle(key)!;
      expect(bundle.defaultTemplatesByPageType.nav).toBeUndefined();
      expect(bundle.defaultTemplatesByPageType.home).toBeUndefined();
      expect(bundle.defaultTemplatesByPageType.category).toBeUndefined();
      expect(bundle.defaultTemplatesByPageType.cart).toBeUndefined();
    });

    it.each(preExistingKeys)(
      "applying %s still resolves nav/home/category/cart to today's current templates via fallback",
      (key) => {
        const theming = createThemingService();
        applyTheme(theming, getThemeBundle(key)!);
        expect(theming.resolveTemplate("nav")).toBe("nav.top-bar");
        expect(theming.resolveTemplate("home")).toBe("home.standard-grid");
        expect(theming.resolveTemplate("category")).toBe("category.standard-grid");
        expect(theming.resolveTemplate("cart")).toBe("cart.standard");
      },
    );
  });

  // Acceptance criterion 4: "Given a unit test constructing a ThemingService and calling
  // applyTheme() with each of the 3 new bundles, then getTokens() and resolveTemplate() for
  // every page type return exactly the values specified above."
  describe("the 3 new bundles (editorial/maximalist/datasheet) apply exactly the specified tokens + templates", () => {
    it("editorial: exact tokens and per-page-type template resolution", () => {
      const theming = createThemingService();
      const editorial = getThemeBundle("editorial")!;
      applyTheme(theming, editorial);

      expect(theming.getTokens()).toEqual({
        "--color-background": "#F2E9D8",
        "--color-text": "#241C14",
        "--color-primary": "#B14B2A",
        "--color-accent": "#5E6E45",
        "--color-muted": "#7A6C58",
        "--color-border": "#C7B586",
        "--font-family": "'Newsreader', 'Iowan Old Style', Georgia, serif",
        "--font-family-display": "'Fraunces', 'Iowan Old Style', Georgia, serif",
        "--radius": "3px",
        "--space-xs": "0.5rem",
        "--space-sm": "1.25rem",
        "--space-md": "2rem",
        "--space-lg": "4.5rem",
        "--font-size-heading-lg": "2.5rem",
        "--font-size-heading-md": "1.5rem",
        "--font-size-body": "1rem",
        "--shadow-card": "0 1px 2px rgba(36,28,20,0.08), 0 4px 12px rgba(36,28,20,0.10)",
      });

      expect(theming.resolveTemplate("pdp")).toBe("pdp.long-scroll");
      expect(theming.resolveTemplate("nav")).toBe("nav.top-bar");
      expect(theming.resolveTemplate("home")).toBe("home.magazine-grid");
      expect(theming.resolveTemplate("category")).toBe("category.magazine-grid");
      expect(theming.resolveTemplate("cart")).toBe("cart.receipt-style");
    });

    it("maximalist: exact tokens and per-page-type template resolution", () => {
      const theming = createThemingService();
      const maximalist = getThemeBundle("maximalist")!;
      applyTheme(theming, maximalist);

      expect(theming.getTokens()).toEqual({
        "--color-background": "#EEF0E6",
        "--color-text": "#17130F",
        "--color-primary": "#FF4515",
        "--color-accent": "#263B8C",
        "--color-muted": "#55503f",
        "--color-border": "#17130F",
        "--font-family": "'Archivo', system-ui, sans-serif",
        "--radius": "16px",
        "--space-xs": "0.5rem",
        "--space-sm": "1rem",
        "--space-md": "2rem",
        "--space-lg": "4rem",
        "--font-size-heading-lg": "3rem",
        "--font-size-heading-md": "1.75rem",
        "--font-size-body": "1rem",
        "--shadow-card": "6px 6px 0 #17130F",
      });

      expect(theming.resolveTemplate("pdp")).toBe("pdp.tabbed-detail");
      expect(theming.resolveTemplate("nav")).toBe("nav.rail");
      expect(theming.resolveTemplate("home")).toBe("home.standard-grid");
      expect(theming.resolveTemplate("category")).toBe("category.standard-grid");
      expect(theming.resolveTemplate("cart")).toBe("cart.standard");
    });

    it("datasheet: exact tokens and per-page-type template resolution", () => {
      const theming = createThemingService();
      const datasheet = getThemeBundle("datasheet")!;
      applyTheme(theming, datasheet);

      expect(theming.getTokens()).toEqual({
        "--color-background": "#F1F3F6",
        "--color-text": "#12151B",
        "--color-primary": "#C8460A",
        "--color-accent": "#5A6170",
        "--color-muted": "#8891A0",
        "--color-border": "#D2D7E0",
        "--font-family": "'IBM Plex Sans', system-ui, sans-serif",
        "--radius": "2px",
        "--space-xs": "8px",
        "--space-sm": "16px",
        "--space-md": "32px",
        "--space-lg": "64px",
        "--font-size-heading-lg": "2.25rem",
        "--font-size-heading-md": "1.375rem",
        "--font-size-body": "1rem",
        "--shadow-card": "none",
      });

      expect(theming.resolveTemplate("pdp")).toBe("pdp.tabbed-detail");
      expect(theming.resolveTemplate("nav")).toBe("nav.top-bar");
      expect(theming.resolveTemplate("home")).toBe("home.spec-grid");
      expect(theming.resolveTemplate("category")).toBe("category.spec-grid");
      expect(theming.resolveTemplate("cart")).toBe("cart.spec-table");
    });

    it("only editorial defines --font-family-display; maximalist/datasheet intentionally omit it (single font family throughout)", () => {
      expect(getThemeBundle("editorial")!.tokens["--font-family-display"]).toBe(
        "'Fraunces', 'Iowan Old Style', Georgia, serif",
      );
      expect(getThemeBundle("maximalist")!.tokens["--font-family-display"]).toBeUndefined();
      expect(getThemeBundle("datasheet")!.tokens["--font-family-display"]).toBeUndefined();
    });
  });
});
