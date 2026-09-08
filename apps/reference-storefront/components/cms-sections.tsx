import type { ComponentInstance } from "@mercatus-liber/cms";
import { getServices } from "../lib/services";

async function HeroBanner({ config }: { config: Record<string, unknown> }) {
  return (
    <section style={{ padding: 24, background: "#222", color: "#fff", marginBottom: 16 }}>
      <h1 style={{ margin: 0 }}>{String(config.headline ?? "")}</h1>
      {config.subheadline ? <p style={{ margin: "8px 0 0" }}>{String(config.subheadline)}</p> : null}
    </section>
  );
}

async function CategorySpot({ config }: { config: Record<string, unknown> }) {
  const { marketingCatalog } = await getServices();
  const slugs = Array.isArray(config.categorySlugs) ? (config.categorySlugs as string[]) : [];
  const categories = (await Promise.all(slugs.map((slug) => marketingCatalog.getCategoryBySlug(slug)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  return (
    <section style={{ marginBottom: 16 }}>
      <h2>Shop by category</h2>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            <a href={`/category/${category.slug}`}>{category.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ProductGrid({ config }: { config: Record<string, unknown> }) {
  const { catalog } = await getServices();
  const productIds = Array.isArray(config.productIds) ? (config.productIds as string[]) : [];
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  return (
    <section>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/products/${product.slug}`}>{product.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * componentType -> React component map -- the app-layer half of the CMS
 * contract (the CMS package only knows a section HAS a componentType +
 * config; turning that into real markup is the app's job, same
 * "concrete choices live in the app" pattern as theming's template map).
 */
export async function CmsSection({ section }: { section: ComponentInstance }) {
  switch (section.componentType) {
    case "hero-banner":
      return <HeroBanner config={section.config} />;
    case "category-spot":
      return <CategorySpot config={section.config} />;
    case "product-grid":
      return <ProductGrid config={section.config} />;
    case "ad-slot":
      return null; // no ad content in this reference demo
    default:
      return null;
  }
}
