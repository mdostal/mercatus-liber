import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction } from "../lib/actions";

/**
 * The "pdp.tabbed-detail" template component. This is the app-layer
 * counterpart to @mercatus-liber/theming's template key -- theming itself
 * stays framework-agnostic (just resolves which key to use); turning a key
 * into real markup is the app's job, same "concrete choices live in the app"
 * pattern as lib/services.ts for adapters. Adding a third layout is: (1) a
 * theming.registerTemplate() call, (2) a new component like this one, (3) one
 * more branch in app/products/[slug]/page.tsx -- no other package changes.
 */
export function PdpTabbedDetail({
  viewModel,
  stockBySkuId = {},
}: {
  viewModel: PdpViewModel;
  stockBySkuId?: Record<string, number>;
}) {
  const { product, skus } = viewModel;

  return (
    <main>
      <h1>{product.title}</h1>
      <p style={{ fontSize: 12, color: "#666" }}>Layout: tabbed-detail</p>

      <details open>
        <summary>Description</summary>
        <p>{product.description}</p>
      </details>

      <details open>
        <summary>Options</summary>
        {skus.map((sku) => (
          <form action={addToCartAction} key={sku.id} style={{ marginBottom: 12 }}>
            <input type="hidden" name="skuId" value={sku.id} />
            <span>
              {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")} --{" "}
              {(sku.price.amount / 100).toFixed(2)} {sku.price.currency} -- in stock: {stockBySkuId[sku.id] ?? 0}
            </span>{" "}
            <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 48 }} />{" "}
            <button type="submit">Add to cart</button>
          </form>
        ))}
      </details>
    </main>
  );
}
