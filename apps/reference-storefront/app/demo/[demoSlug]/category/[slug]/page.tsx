import { notFound } from "next/navigation";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ demoSlug: string; slug: string }> }) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { marketingCatalog, catalog } = await getServicesForDemo(demoSlug);
  const category = await marketingCatalog.getCategoryBySlug(slug);
  if (!category) notFound();

  const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      <InteractionTracker eventName="category_viewed" properties={{ categoryId: category.id, slug: category.slug }} />
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{category.title}</h1>
      <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>{category.description}</p>
      <ul
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "var(--space-sm, 16px)",
          listStyle: "none",
          padding: 0,
          marginTop: "var(--space-md, 32px)",
        }}
      >
        {products.map((product) => (
          <li
            key={product.id}
            style={{
              border: "1px solid var(--color-border, #ddd)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-card, none)",
              padding: "var(--space-sm, 16px)",
            }}
          >
            <a
              href={`/demo/${demoSlug}/products/${product.slug}`}
              style={{ textDecoration: "none", color: "inherit", fontSize: "var(--font-size-body, 1rem)" }}
            >
              {product.title}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
