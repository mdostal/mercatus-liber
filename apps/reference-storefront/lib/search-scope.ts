import type { CatalogService } from "@mercatus-liber/catalog";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { DemoSlug } from "./demos";
import { getLineForDemo } from "./lines";

export interface SearchScope {
  kind: "line" | "category";
  slug: string;
  title: string;
  /** The product ids search is limited to. */
  ids: string[];
}

/**
 * What a search is limited to: a line of this demo (?line=) or a category
 * (?category=), as product ids read now. Null for an unscoped search, and for
 * a scope that doesn't exist or isn't this demo's (search falls back to
 * everything rather than to nothing).
 */
export async function searchScope(
  services: { catalog: CatalogService; marketingCatalog: MarketingCatalogService },
  demoSlug: DemoSlug,
  wanted: { line?: string; category?: string },
): Promise<SearchScope | null> {
  if (wanted.line) {
    const landing = await getLineForDemo(services.catalog, demoSlug, wanted.line);
    if (!landing) return null;
    const ids = await services.catalog.listProductIdsInCatalog(landing.catalog.id);
    return { kind: "line", slug: landing.catalog.slug, title: landing.catalog.hero?.title ?? landing.catalog.name, ids };
  }
  if (wanted.category) {
    const category = await services.marketingCatalog.getCategoryBySlug(wanted.category);
    if (!category || (category.demoSlug && category.demoSlug !== demoSlug)) return null;
    return { kind: "category", slug: category.slug, title: category.title, ids: await services.marketingCatalog.listProductIdsInCategory(category.id) };
  }
  return null;
}
