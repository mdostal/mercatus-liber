import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Product } from "@mercatus-liber/core";
import { CategoryMagazineGrid } from "../../../../../components/category-magazine-grid";
import { CategorySpecGrid } from "../../../../../components/category-spec-grid";
import { CategoryStandardGrid } from "../../../../../components/category-standard-grid";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug, type DemoSlug } from "../../../../../lib/demos";
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
} as const;

export default async function CategoryPage({ params }: { params: Promise<{ demoSlug: string; slug: string }> }) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { marketingCatalog, catalog, theming } = await getServicesForDemo(demoSlug);
  const category = await marketingCatalog.getCategoryBySlug(slug);
  if (!category) notFound();

  const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  // Same override-from-active-bundle pattern PDP already uses: the active
  // theme bundle's own defaultTemplatesByPageType.category is passed as the
  // explicit override (undefined for the 7 pre-existing bundles, which
  // don't define one, so resolveTemplate falls back to its own
  // first-registered-template default, "category.standard-grid").
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateKey = theming.resolveTemplate("category", activeTheme.defaultTemplatesByPageType.category);
  const Template: ComponentType<{ demoSlug: DemoSlug; products: Product[] }> =
    (templateKey && CATEGORY_TEMPLATES[templateKey as keyof typeof CATEGORY_TEMPLATES]) || CategoryStandardGrid;

  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      <InteractionTracker eventName="category_viewed" properties={{ categoryId: category.id, slug: category.slug }} />
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{category.title}</h1>
      <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>{category.description}</p>
      <Template demoSlug={demoSlug} products={products} />
    </main>
  );
}
