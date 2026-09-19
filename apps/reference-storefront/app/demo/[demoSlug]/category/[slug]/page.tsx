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
import { resolvePageTemplateOverride } from "../../../../../lib/resolve-page-template";
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

  // real-store-depth epic: listChildCategories/parentId already existed as
  // a real, tested MarketingCatalogService capability (see its own doc
  // comment: "Pass null for top-level categories") but no demo had ever
  // seeded a non-top-level category, so no page ever called it. Additive --
  // a category with no children (every category before this epic) renders
  // exactly as before; a top-level category WITH real subcategories now
  // shows a "Shop by" link list, and a subcategory page now shows its real
  // parent in the breadcrumb instead of going straight to Home.
  const [childCategories, parentCategory] = await Promise.all([
    marketingCatalog.listChildCategories(category.id),
    category.parentId ? marketingCatalog.getCategory(category.parentId) : Promise.resolve(null),
  ]);

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
  // per-demo-backend-diversity epic: this was a sequential for-loop
  // (one awaited network round-trip per product, one at a time) -- harmless
  // latency against a local/low-latency backend, but a real, confirmed
  // problem once a demo's catalog resolves to a genuinely remote database
  // (MongoDB Atlas/Convex): a category with N products took N sequential
  // round-trips just for this one price-range computation, live-measured
  // at several seconds for a real category page against Mongo/Convex,
  // risking a serverless function timeout in production. Parallelized with
  // Promise.all, same pattern the products lookup right above already uses.
  const specsByProductId: Record<string, CategorySpecRow> = {};
  const skusByProduct = await Promise.all(
    products.map(async (product) => ({ product, skus: await catalog.listSkusByProduct(product.id) })),
  );
  for (const { product, skus } of skusByProduct) {
    if (skus.length === 0) continue;
    const amounts = skus.map((sku) => sku.price.amount);
    specsByProductId[product.id] = {
      minPriceCents: Math.min(...amounts),
      maxPriceCents: Math.max(...amounts),
      currency: skus[0]!.price.currency,
      skuCount: skus.length,
    };
  }

  // scc-04: resolvePageTemplateOverride's shared precedence (lib/resolve-page-template.ts)
  // -- an admin's own per-page-type override (content-layout dashboard) wins,
  // else the active theme bundle's own defaultTemplatesByPageType.category
  // (undefined for the 7 pre-existing bundles, which don't define one), else
  // resolveTemplate's own first-registered-template default, "category.standard-grid".
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateKey = theming.resolveTemplate("category", resolvePageTemplateOverride(theming, "category", activeTheme));
  const Template: ComponentType<{
    demoSlug: DemoSlug;
    products: Product[];
    specsByProductId?: Record<string, CategorySpecRow>;
    media: ImageAdapter;
  }> = (templateKey && CATEGORY_TEMPLATES[templateKey as keyof typeof CATEGORY_TEMPLATES]) || CategoryStandardGrid;

  // seo-02: real BreadcrumbList JSON-LD (Home -> [Parent ->] Category),
  // matching the real nav hierarchy -- design-discussion.md §2c. The
  // parent hop is additive: every category without a real seeded parent
  // (every category before this epic) still gets exactly the original
  // 2-item Home -> Category trail.
  const breadcrumbItems: BreadcrumbItem[] = [{ name: "Home", url: canonicalUrl(`/demo/${demoSlug}`) }];
  if (parentCategory) {
    breadcrumbItems.push({
      name: parentCategory.title,
      url: canonicalUrl(`/demo/${demoSlug}/category/${parentCategory.slug}`),
    });
  }
  breadcrumbItems.push({ name: category.title, url: canonicalUrl(`/demo/${demoSlug}/category/${category.slug}`) });

  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      <JsonLd data={breadcrumbList(breadcrumbItems)} />
      <InteractionTracker eventName="category_viewed" properties={{ categoryId: category.id, slug: category.slug }} />
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{category.title}</h1>
      <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>{category.description}</p>
      {childCategories.length > 0 && (
        <nav
          aria-label="Subcategories"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-xs, 8px)",
            margin: "var(--space-sm, 16px) 0",
          }}
        >
          <span style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>Shop by:</span>
          {childCategories.map((child) => (
            <a
              key={child.id}
              href={`/demo/${demoSlug}/category/${child.slug}`}
              style={{
                border: "1px solid var(--color-border, #e5e5e5)",
                borderRadius: "var(--radius)",
                padding: "var(--space-xs, 4px) var(--space-sm, 12px)",
                color: "var(--color-text)",
                textDecoration: "none",
                fontSize: "var(--font-size-body, 1rem)",
              }}
            >
              {child.title}
            </a>
          ))}
        </nav>
      )}
      <Template demoSlug={demoSlug} products={products} specsByProductId={specsByProductId} media={media} />
    </main>
  );
}
