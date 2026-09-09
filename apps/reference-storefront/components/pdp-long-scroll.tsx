import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

/** The "pdp.long-scroll" template component -- same view-model data as pdp-tabbed-detail, different presentation (everything inline, eBay-style, no collapsing). */
export function PdpLongScroll({
  demoSlug,
  viewModel,
  stockBySkuId = {},
  customizable = false,
}: {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  /** `null` means not inventory-tracked (always available, e.g. a bookable service) -- distinct from a real tracked 0. */
  stockBySkuId?: Record<string, number | null>;
  /** print-shop-02: same additive/optional personalization-input flag as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  customizable?: boolean;
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
            {stockBySkuId[sku.id] == null ? "Available" : `In stock: ${stockBySkuId[sku.id]}`}
          </div>
          <input type="number" name="quantity" defaultValue={1} min={1} style={{ width: 48 }} />{" "}
          {customizable && (
            <div style={{ marginTop: "var(--space-xs, 8px)" }}>
              <label
                htmlFor={`customizationNote-${sku.id}`}
                style={{ display: "block", fontSize: "var(--font-size-body, 1rem)", color: "var(--color-muted, #666)" }}
              >
                Personalize this item (e.g. embroidery text, thread color)
              </label>
              <input
                id={`customizationNote-${sku.id}`}
                type="text"
                name="customizationNote"
                placeholder="e.g. Text: Sarah -- thread color: navy"
                style={{ width: "100%", maxWidth: 360 }}
              />
            </div>
          )}
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
