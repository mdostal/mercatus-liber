import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction } from "../lib/actions";

/** The "pdp.long-scroll" template component -- same view-model data as pdp-tabbed-detail, different presentation (everything inline, eBay-style, no collapsing). */
export function PdpLongScroll({ viewModel }: { viewModel: PdpViewModel }) {
  const { product, skus, optionValues } = viewModel;

  return (
    <main>
      <h1>{product.title}</h1>
      <p style={{ fontSize: 12, color: "#666" }}>Layout: long-scroll</p>

      <p>{product.description}</p>

      <h2>Available options</h2>
      <ul>
        {optionValues.map((option) => (
          <li key={option.key}>
            {option.key}: {option.values.map(String).join(", ")}
          </li>
        ))}
      </ul>

      <h2>Buy</h2>
      {skus.map((sku) => (
        <form action={addToCartAction} key={sku.id} style={{ marginBottom: 16, borderTop: "1px solid #eee", paddingTop: 8 }}>
          <input type="hidden" name="skuId" value={sku.id} />
          <div>{sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")}</div>
          <div>
            Price: {(sku.price.amount / 100).toFixed(2)} {sku.price.currency}
          </div>
          <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 48 }} />{" "}
          <button type="submit">Add to cart</button>
        </form>
      ))}
    </main>
  );
}
