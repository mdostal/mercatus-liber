import Link from "next/link";
import { notFound } from "next/navigation";
import type { Money } from "@mercatus-liber/core";
import { isDemoSlug } from "../../../../../../../lib/demos";
import { generateSkuComboAction } from "../../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../../lib/services";

export const dynamic = "force-dynamic";

/** Same minor-unit-to-display convention already used by admin/metrics/page.tsx's own formatMoney. */
function formatMoney(money: Money): string {
  return `${(money.amount / 100).toFixed(2)} ${money.currency}`;
}

/**
 * pc-03: the admin SKU-matrix view -- shows a product's real, current SKU
 * matrix (every existing identifying-attribute combination, its price, its
 * stock) plus a form to add a new combination via catalog.generateSkus
 * (see generateSkuComboAction, lib/actions.ts). No per-product admin detail
 * view exists yet in this repo (confirmed: admin/catalog/page.tsx is a
 * flat, read-only product list with no per-row link) so this is a new leaf
 * route under that same Catalog section, linked from there, rather than a
 * new top-level nav item -- same "plain HTML list/detail page under an
 * existing section" convention as bundles/promotions/recommendations.
 */
export default async function AdminProductSkusPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string; productId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { demoSlug, productId } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { error } = await searchParams;

  const { catalog, inventory } = await getServicesForDemo(demoSlug);
  const product = await catalog.getProduct(productId);
  if (!product) notFound();

  const skus = await catalog.listSkusByProduct(productId);
  const stockBySkuId: Record<string, number | null> = {};
  for (const sku of skus) {
    const level = await inventory.getStock(sku.id);
    stockBySkuId[sku.id] = level ? level.onHand - level.reserved : null;
  }

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/catalog`}>← Catalog</Link>
      </p>
      <h1>Admin: SKU matrix -- {product.title}</h1>
      <p style={{ color: "#666" }}>
        Identifying attribute keys: {product.identifyingAttributeKeys.join(", ")}
      </p>

      <table>
        <thead>
          <tr>
            <th>SKU id</th>
            {product.identifyingAttributeKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
            <th>Price</th>
            <th>Stock</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => {
            const attrByKey = Object.fromEntries(sku.identifyingAttributes.map((a) => [a.key, a.value]));
            const stock = stockBySkuId[sku.id];
            return (
              <tr key={sku.id}>
                <td>{sku.id}</td>
                {product.identifyingAttributeKeys.map((key) => (
                  <td key={key}>{String(attrByKey[key] ?? "")}</td>
                ))}
                <td>{formatMoney(sku.price)}</td>
                <td>{stock === null ? "not tracked" : stock}</td>
                <td>{sku.status}</td>
              </tr>
            );
          })}
          {skus.length === 0 ? (
            <tr>
              <td colSpan={product.identifyingAttributeKeys.length + 4}>No SKUs yet for this product.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <h2>Add a new combination</h2>
      {error ? (
        <p style={{ color: "#b91c1c", border: "1px solid #b91c1c", padding: "8px 12px" }}>{error}</p>
      ) : null}
      <form action={generateSkuComboAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="productId" value={productId} />
        {product.identifyingAttributeKeys.map((key) => (
          <p key={key}>
            <label>
              {key}
              <br />
              <input type="text" name={`attr_${key}`} required />
            </label>
          </p>
        ))}
        <p>
          <label>
            Price (minor-unit amount, e.g. cents)
            <br />
            <input type="number" name="price" required />
          </label>
        </p>
        <p>
          <label>
            Currency
            <br />
            <input type="text" name="currency" defaultValue="USD" />
          </label>
        </p>
        <p>
          <label>
            Initial stock (blank = 0, same as a freshly seeded SKU)
            <br />
            <input type="number" name="stock" />
          </label>
        </p>
        <p>
          <button type="submit">Add combination</button>
        </p>
      </form>
    </main>
  );
}
