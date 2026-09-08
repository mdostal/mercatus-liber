import { getServices } from "../lib/services";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { catalog } = await getServices();
  const products = await catalog.listProducts({ status: "active" });

  return (
    <main>
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
