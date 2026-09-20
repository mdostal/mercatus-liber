import type { ThemeBundle, ThemingService } from "@mercatus-liber/theming";

/**
 * scc-04 (content-layout dashboard): the one shared precedence composition
 * every page-type render call site (layout.tsx's nav chrome, page.tsx's
 * home, category/[slug]/page.tsx, cart/page.tsx, products/[slug]/page.tsx)
 * now uses to decide what to pass as ThemingService.resolveTemplate's own
 * `override` argument, replacing each call site's previous one-liner of
 * "pass the active bundle's own pick straight through" (design-system-v2-02)
 * with a chain that also lets this dashboard's own per-page-type admin
 * override win.
 *
 * Tier order (highest wins):
 *   1. `explicitOverride` -- a genuinely per-request choice. Today only
 *      products/[slug]/page.tsx's own `?template=` query string uses this
 *      tier (see that page's own doc comment) -- deliberately still wins
 *      over an admin's stored default, same as it already won over the
 *      active theme bundle before this story.
 *   2. This dashboard's own per-page-type pick: `setPageTemplateAction`
 *      (lib/actions.ts) calls `theming.setDefaultTemplate(pageType, ...)`;
 *      read back here via `theming.getConfiguredDefault(pageType)`.
 *      Queried and re-injected as `resolveTemplate`'s own `override`
 *      parameter (rather than relying on `resolveTemplate`'s OWN internal
 *      override > configured-default > first-registered precedence, whose
 *      "configured default" tier sits BELOW a plain function-argument
 *      override) -- otherwise tier 3 below (the whole-bundle theme's own
 *      pick, passed as a plain argument by every call site) would always
 *      beat it, since resolveTemplate has no way to know one caller-supplied
 *      value should outrank another.
 *   3. `bundle.defaultTemplatesByPageType[pageType]` -- the active
 *      whole-bundle theme's own pick for this page type (the /themes page's
 *      applyThemeAction + theme-cookie.ts's readActiveThemeBundle
 *      mechanism, unchanged by this story). Only 3 of today's 10 bundles
 *      (editorial/maximalist/datasheet) define anything beyond `pdp`; the
 *      other 7 leave nav/home/category/cart undefined here, which is why a
 *      per-page-type admin override already "just worked" for those page
 *      types even before this composition existed -- this closes the same
 *      gap for `pdp` (which every bundle defines) and for the 3 richer
 *      bundles' nav/home/category/cart picks too.
 *   4. Neither of the above -- `resolveTemplate` itself falls back to the
 *      first-registered template for this page type.
 *
 * Purely a composition of ThemingService's existing public methods --
 * proves a per-page-type admin override is not a separate rendering code
 * path, same spirit as theme-bundles.ts's own applyTheme() doc comment.
 */
export function resolvePageTemplateOverride(
  theming: ThemingService,
  pageType: string,
  bundle: ThemeBundle,
  explicitOverride?: string,
): string | undefined {
  return explicitOverride ?? theming.getConfiguredDefault(pageType) ?? bundle.defaultTemplatesByPageType[pageType];
}

/** Convenience wrapper for the common case: resolve straight through to the final template key, no `?template=`-style explicit override involved. */
export function resolvePageTemplateKey(theming: ThemingService, pageType: string, bundle: ThemeBundle): string | null {
  return theming.resolveTemplate(pageType, resolvePageTemplateOverride(theming, pageType, bundle));
}
