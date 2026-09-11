import type { ComponentInstance } from "@mercatus-liber/cms";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import { getThemeBundle, type ThemeBundle } from "@mercatus-liber/theming";
import type { StorefrontView } from "@mercatus-liber/storefront-views";

/** A curated view's product grid never shows more than this many products, same cap the story asked for. */
const MAX_VIEW_PRODUCT_IDS = 12;

export interface ViewSections {
  sections: ComponentInstance[];
  theme: ThemeBundle;
}

/**
 * storefront-views-and-multi-catalog epic: turns one real StorefrontView
 * into the same CMS-shaped `sections` array + resolved theme that both
 * app/demo/[demoSlug]/site/[viewSlug]/page.tsx (the view's own permanent
 * route) and app/demo/[demoSlug]/page.tsx (the active-default-override
 * takeover branch) render through -- kept as ONE shared helper so neither
 * call site can drift from the other.
 *
 * Resolves the view's curated categoryIds against the store's own real
 * MarketingCatalogService (never fabricated/duplicated category data), then
 * flattens+dedupes each resolved category's real product ids into a single
 * capped list. Every rendered category/product link still points at the
 * same real /category/[slug] and /products/[slug] routes every other page
 * uses (see cms-sections.tsx's CategorySpot/ProductGrid, which this app's
 * home templates already render `sections` through) -- this view is a
 * curated entry point, never a parallel copy of those pages.
 *
 * `baseTheme` is the caller's own already-resolved fallback (the demo's
 * normal active theme, from readActiveThemeBundle) -- this only overrides it
 * with the view's own themeKey when that key is set AND resolves to a real
 * registered bundle; `themeKey: null`, or an unknown key, both inherit
 * baseTheme unchanged.
 */
export async function buildViewSections(
  services: { marketingCatalog: MarketingCatalogService },
  view: StorefrontView,
  baseTheme: ThemeBundle,
): Promise<ViewSections> {
  const categories = (
    await Promise.all(view.categoryIds.map((id) => services.marketingCatalog.getCategory(id)))
  ).filter((category): category is NonNullable<typeof category> => category !== null);

  const productIdSet = new Set<string>();
  for (const category of categories) {
    const ids = await services.marketingCatalog.listProductIdsInCategory(category.id);
    for (const id of ids) productIdSet.add(id);
  }
  const productIds = Array.from(productIdSet).slice(0, MAX_VIEW_PRODUCT_IDS);

  const theme = view.themeKey ? (getThemeBundle(view.themeKey) ?? baseTheme) : baseTheme;

  const sections: ComponentInstance[] = [
    { componentType: "hero-banner", config: { headline: view.heroHeadline, subheadline: view.heroSubheadline } },
    ...(categories.length > 0
      ? [{ componentType: "category-spot", config: { categorySlugs: categories.map((category) => category.slug) } }]
      : []),
    ...(productIds.length > 0 ? [{ componentType: "product-grid", config: { productIds } }] : []),
  ];

  return { sections, theme };
}
