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
  customizable = false,
  themeKey,
}: {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  /** `null` means not inventory-tracked (always available, e.g. a bookable service) -- distinct from a real tracked 0. */
  stockBySkuId?: Record<string, number | null>;
  /** print-shop-02: when true, renders a real personalization text input inside each SKU's add-to-cart form (design-discussion.md §1b). Additive/optional -- omitted entirely for every non-customizable product, so this template's markup/behavior is unchanged for them. */
  customizable?: boolean;
  /**
   * visual-fidelity-maximalist: additive/optional -- the active theme
   * bundle's key, threaded in only so this shared template (registered as
   * "pdp.tabbed-detail" by 8 of the 10 bundles, including "maximalist" and
   * "datasheet") can apply the real "Blaze Theme" PDP CSS ONLY when
   * "maximalist" is active. Every other bundle either omits this prop or
   * passes a different key, both of which render byte-for-byte what this
   * template rendered before this field existed.
   */
  themeKey?: string;
}) {
  const { product, skus } = viewModel;
  const isMaximalist = themeKey === "maximalist";

  return (
    <main className={isMaximalist ? "mx-pdp" : undefined}>
      {isMaximalist && <style>{MX_PDP_CSS}</style>}
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
            <span
              className={isMaximalist ? "mx-pdp-price" : undefined}
              style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}
            >
              {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")} --{" "}
              {(sku.price.amount / 100).toFixed(2)} {sku.price.currency} --{" "}
              {stockBySkuId[sku.id] == null ? "available" : `in stock: ${stockBySkuId[sku.id]}`}
            </span>{" "}
            <input
              className={isMaximalist ? "mx-pdp-qty" : undefined}
              type="number"
              name="quantity"
              defaultValue={1}
              min={1}
              style={{ width: 48 }}
            />{" "}
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
              className={isMaximalist ? "mx-pdp-addtocart" : undefined}
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

/**
 * visual-fidelity-maximalist: the real ported "Blaze Theme" PDP CSS
 * (mockup's thick-border/hard-shadow card treatment, Anton display heading,
 * Space Mono pricing, sticker-orange add-to-cart button). Only ever
 * rendered when `themeKey === "maximalist"` (see `isMaximalist` above), so
 * this has zero visual effect on the 7 other bundles that also register
 * "pdp.tabbed-detail" (classic/dark/retro/high-contrast/northline/
 * datasheet, plus minimal/vibrant which register "pdp.long-scroll"
 * instead and never render this component at all). `mx-`-prefixed classes
 * throughout per this epic's collision-avoidance convention.
 */
const MX_PDP_CSS = `
  .mx-pdp {
    border: 3px solid var(--color-border, #17130F);
    border-radius: 16px;
    box-shadow: 9px 9px 0 var(--color-border, #17130F);
    padding: clamp(20px, 4vw, 36px);
    background: #fff;
  }
  .mx-pdp h1 {
    font-family: 'Anton', 'Archivo Black', Impact, ui-sans-serif, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 0.94;
  }
  .mx-pdp summary {
    font-family: 'Anton', 'Archivo Black', Impact, ui-sans-serif, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    cursor: pointer;
  }
  .mx-pdp-price {
    font-family: 'Space Mono', ui-monospace, monospace !important;
    font-weight: 700;
  }
  .mx-pdp-qty {
    border: 2.5px solid var(--color-border, #17130F);
    border-radius: 8px;
    font-family: 'Space Mono', ui-monospace, monospace;
    text-align: center;
  }
  .mx-pdp-addtocart {
    font-family: var(--font-family, 'Archivo', sans-serif) !important;
    font-weight: 800 !important;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 3px solid var(--color-border, #17130F) !important;
    box-shadow: 5px 5px 0 var(--color-border, #17130F);
    color: var(--color-text, #17130F) !important;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .mx-pdp-addtocart:hover {
    transform: translate(-2px, -2px);
    box-shadow: 7px 7px 0 var(--color-border, #17130F);
  }
`;
