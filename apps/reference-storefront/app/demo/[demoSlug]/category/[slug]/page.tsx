import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Product } from "@mercatus-liber/core";
import type { ImageAdapter } from "@mercatus-liber/media";
import { CategoryMagazineGrid } from "../../../../../components/category-magazine-grid";
import { CategoryMaximalistGrid } from "../../../../../components/category-maximalist-grid";
import { CategorySpecGrid, type CategorySpecRow } from "../../../../../components/category-spec-grid";
import { CategoryStandardGrid } from "../../../../../components/category-standard-grid";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug, type DemoSlug } from "../../../../../lib/demos";
import { breadcrumbList, JsonLd, type BreadcrumbItem } from "../../../../../lib/json-ld";
import { getServicesForDemo } from "../../../../../lib/services";
import { canonicalUrl } from "../../../../../lib/site-url";
import { readActiveThemeBundle } from "../../../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/** seo-01: real per-category metadata -- title is the exact real category title, description the real category description, canonical the real absolute URL for this category. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ demoSlug: string; slug: string }>;
}): Promise<Metadata> {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const { marketingCatalog } = await getServicesForDemo(demoSlug);
  const category = await marketingCatalog.getCategoryBySlug(slug);
  if (!category) return {};

  const path = `/demo/${demoSlug}/category/${category.slug}`;

  return {
    title: category.title,
    description: category.description,
    alternates: { canonical: canonicalUrl(path) },
  };
}

/**
 * Template-key -> component map, the app-layer half of the theming
 * contract (mirrors products/[slug]/page.tsx's PDP_TEMPLATES map exactly).
 * Adding a new registered "category" template requires one more entry here.
 */
const CATEGORY_TEMPLATES = {
  "category.standard-grid": CategoryStandardGrid,
  "category.magazine-grid": CategoryMagazineGrid,
  "category.spec-grid": CategorySpecGrid,
  "category.maximalist-grid": CategoryMaximalistGrid,
} as const;

export default async function CategoryPage({ params }: { params: Promise<{ demoSlug: string; slug: string }> }) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { marketingCatalog, catalog, theming, media } = await getServicesForDemo(demoSlug);
  const category = await marketingCatalog.getCategoryBySlug(slug);
  if (!category) notFound();

  const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  // visual-fidelity-datasheet: real per-product price-range data, computed
  // from each product's real SKUs (same "app composes multiple services"
  // pattern as products/[slug]/page.tsx's buildProductOffers) -- additive
  // and optional (CategorySpecRow, components/category-spec-grid.tsx): the
  // other 3 category templates don't declare this prop, so computing and
  // passing it is a no-op for them, never a fabricated price.
  const specsByProductId: Record<string, CategorySpecRow> = {};
  for (const product of products) {
    const skus = await catalog.listSkusByProduct(product.id);
    if (skus.length === 0) continue;
    const amounts = skus.map((sku) => sku.price.amount);
    specsByProductId[product.id] = {
      minPriceCents: Math.min(...amounts),
      maxPriceCents: Math.max(...amounts),
      currency: skus[0]!.price.currency,
      skuCount: skus.length,
    };
  }

  // Same override-from-active-bundle pattern PDP already uses: the active
  // theme bundle's own defaultTemplatesByPageType.category is passed as the
  // explicit override (undefined for the 7 pre-existing bundles, which
  // don't define one, so resolveTemplate falls back to its own
  // first-registered-template default, "category.standard-grid").
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateKey = theming.resolveTemplate("category", activeTheme.defaultTemplatesByPageType.category);
  const Template: ComponentType<{
    demoSlug: DemoSlug;
    products: Product[];
    specsByProductId?: Record<string, CategorySpecRow>;
    media: ImageAdapter;
  }> = (templateKey && CATEGORY_TEMPLATES[templateKey as keyof typeof CATEGORY_TEMPLATES]) || CategoryStandardGrid;

  // seo-02: real BreadcrumbList JSON-LD (Home -> Category), matching the
  // real nav hierarchy -- design-discussion.md §2c.
  const breadcrumbItems: BreadcrumbItem[] = [
    { name: "Home", url: canonicalUrl(`/demo/${demoSlug}`) },
    { name: category.title, url: canonicalUrl(`/demo/${demoSlug}/category/${category.slug}`) },
  ];

  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      <JsonLd data={breadcrumbList(breadcrumbItems)} />
      <InteractionTracker eventName="category_viewed" properties={{ categoryId: category.id, slug: category.slug }} />
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{category.title}</h1>
      <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>{category.description}</p>
      <Template demoSlug={demoSlug} products={products} specsByProductId={specsByProductId} media={media} />
    </main>
  );
}
