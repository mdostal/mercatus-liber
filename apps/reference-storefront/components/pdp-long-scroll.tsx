import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

/** The "pdp.long-scroll" template component -- same view-model data as pdp-tabbed-detail, different presentation (everything inline, eBay-style, no collapsing). */
export function PdpLongScroll({
  demoSlug,
  viewModel,
  stockBySkuId = {},
}: {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  stockBySkuId?: Record<string, number>;
}) {
  const { product, skus, optionValues } = viewModel;

  return (
    <main>
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{product.title}</h1>

      <p style={{ fontSize: "var(--font-size-body, 1rem)" }}>{product.description}</p>

      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Available options</h2>
      <ul>
        {optionValues.map((option) => (
          <li key={option.key} style={{ fontSize: "var(--font-size-body, 1rem)" }}>
            {option.key}: {option.values.map(String).join(", ")}
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Buy</h2>
      {skus.map((sku) => (
        <form
          action={addToCartAction}
          key={sku.id}
          style={{
            marginBottom: "var(--space-sm, 16px)",
            borderTop: "1px solid var(--color-border, #e5e5e5)",
            paddingTop: "var(--space-xs, 8px)",
          }}
        >
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <input type="hidden" name="skuId" value={sku.id} />
          <div style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
            {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")}
          </div>
          <div style={{ fontSize: "var(--font-size-body, 1rem)" }}>
            Price: {(sku.price.amount / 100).toFixed(2)} {sku.price.currency}
          </div>
          <div style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
            In stock: {stockBySkuId[sku.id] ?? 0}
          </div>
          <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 48 }} />{" "}
          <button
            type="submit"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-background)",
              borderRadius: "var(--radius)",
              border: "none",
              padding: "var(--space-xs, 8px) var(--space-sm, 16px)",
            }}
          >
            Add to cart
          </button>
        </form>
      ))}
    </main>
  );
}
