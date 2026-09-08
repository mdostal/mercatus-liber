import { notFound } from "next/navigation";
import { addToCartAction } from "../../../lib/actions";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { catalog } = await getServices();
  const product = await catalog.getProductBySlug(slug);
  if (!product) notFound();

  const skus = await catalog.listSkusByProduct(product.id);

  return (
    <main>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      {skus.map((sku) => (
        <form action={addToCartAction} key={sku.id} style={{ marginBottom: 12 }}>
          <input type="hidden" name="skuId" value={sku.id} />
          <span>
            {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")} --{" "}
            {(sku.price.amount / 100).toFixed(2)} {sku.price.currency}
          </span>{" "}
          <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 48 }} />{" "}
          <button type="submit">Add to cart</button>
        </form>
      ))}
    </main>
  );
}
