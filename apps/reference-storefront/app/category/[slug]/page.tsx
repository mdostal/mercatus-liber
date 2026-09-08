import { notFound } from "next/navigation";
import { InteractionTracker } from "../../../components/interaction-tracker";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { marketingCatalog, catalog } = await getServices();
  const category = await marketingCatalog.getCategoryBySlug(slug);
  if (!category) notFound();

  const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  return (
    <main>
      <InteractionTracker eventName="category_viewed" properties={{ categoryId: category.id, slug: category.slug }} />
      <h1>{category.title}</h1>
      <p>{category.description}</p>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/products/${product.slug}`}>{product.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
