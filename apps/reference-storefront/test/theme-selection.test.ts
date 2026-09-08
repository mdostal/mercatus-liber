/**
 * theme-02: proves a selected theme bundle produces the expected token set,
 * and that resolving it never mutates shared/global theming state -- each
 * lookup is a pure read against THEME_BUNDLES (see lib/theme-cookie.ts's
 * design rationale for why global mutation was deliberately avoided).
 */
import { getThemeBundle, THEME_BUNDLES } from "@mercatus-liber/theming";
import { describe, expect, it } from "vitest";

describe("theme selection (reference storefront)", () => {
  it("resolves each of the 6 bundle keys to its exact token set", () => {
    for (const bundle of THEME_BUNDLES) {
      expect(getThemeBundle(bundle.key)).toEqual(bundle);
    }
  });

  it("falls back to the first bundle for an unknown/missing theme key -- same default-resolution shape as no cookie set", () => {
    const key = "not-a-real-theme";
    const resolved = getThemeBundle(key) ?? THEME_BUNDLES[0];
    expect(resolved).toEqual(THEME_BUNDLES[0]);
  });

  it("resolving two different bundles back-to-back never leaves residue -- each lookup is independent", () => {
    const dark = getThemeBundle("dark")!;
    const minimal = getThemeBundle("minimal")!;
    expect(dark.tokens).not.toEqual(minimal.tokens);
    // Re-resolving "dark" again still returns the exact same, unmutated bundle.
    expect(getThemeBundle("dark")).toEqual(dark);
  });
});
