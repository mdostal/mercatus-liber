import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

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
  demoSlug,
  viewModel,
  stockBySkuId = {},
}: {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  stockBySkuId?: Record<string, number>;
}) {
  const { product, skus } = viewModel;

  return (
    <main>
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{product.title}</h1>

      <details open>
        <summary style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Description</summary>
        <p style={{ fontSize: "var(--font-size-body, 1rem)" }}>{product.description}</p>
      </details>

      <details open>
        <summary style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Options</summary>
        {skus.map((sku) => (
          <form action={addToCartAction} key={sku.id} style={{ marginBottom: "var(--space-sm, 16px)" }}>
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="hidden" name="skuId" value={sku.id} />
            <span style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
              {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")} --{" "}
              {(sku.price.amount / 100).toFixed(2)} {sku.price.currency} -- in stock: {stockBySkuId[sku.id] ?? 0}
            </span>{" "}
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
      </details>
    </main>
  );
}
