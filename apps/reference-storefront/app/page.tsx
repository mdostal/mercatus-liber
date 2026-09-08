import { getServices } from "../lib/services";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { catalog, marketingCatalog } = await getServices();
  const products = await catalog.listProducts({ status: "active" });
  const topLevelCategories = await marketingCatalog.listChildCategories(null);

  return (
    <main>
      <h1>Categories</h1>
      <ul>
        {topLevelCategories.map((category) => (
          <li key={category.id}>
            <a href={`/category/${category.slug}`}>{category.title}</a>
          </li>
        ))}
      </ul>

      <h1>Catalog</h1>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/products/${product.slug}`}>{product.title}</a> -- {product.description}
          </li>
        ))}
      </ul>
    </main>
  );
}
