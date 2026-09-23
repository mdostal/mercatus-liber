import type { Sku } from "@mercatus-liber/core";
import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction, submitReviewAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";
import { DS_ATOMS_CSS, DS_FONT_MONO } from "./datasheet-styles";
import { VariantPicker } from "./variant-picker";

/** "★★★★☆"-style rendering of a rating (rounded to the nearest whole star), same convention as pdp-tabbed-detail.tsx's own ratingStars. */
function ratingStars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

/**
 * The "pdp.spec-sheet" template -- the real "Datasheet Storefront" PDP,
 * ported from the approved mockup's `.pdp`/`.pdp-art`/`.pdp-info`/
 * `.datasheet-table`/`.stepper` rules (design-discussion.md §1: "spec-table
 * PDP layout, monospace pricing").
 *
 * visual-fidelity-datasheet: `pdp.tabbed-detail` (pdp-tabbed-detail.tsx) is
 * genuinely shared -- it's the registered PDP default for 6 of the other 9
 * bundles (classic/dark/retro/northline/maximalist, plus it's the
 * first-registered fallback for any bundle that sets no PDP default at
 * all), not just maximalist as this fix's brief called out. Restyling it
 * in place, even conditionally, would be real cross-theme risk for far
 * more than one other bundle. A dedicated template registered only for
 * `datasheet` (same "new template key, new component, one more page.tsx
 * map entry" pattern this package's own pdp-tabbed-detail.tsx doc comment
 * describes for adding a 3rd PDP layout) is zero-risk by construction: it
 * only ever renders when `datasheet` is the active bundle.
 *
 * Same real `PdpViewModel` shape as pdp-tabbed-detail.tsx (product + real
 * SKUs, no invented fields) -- works generically across every demo's real
 * product data, not just a single hardcoded example.
 *
 * pc-01: a 2+-SKU product now renders the real interactive variant-picker
 * (one real `<select>` per identifying-attribute key) plus a single
 * add-to-cart row for whichever SKU the page has resolved the current
 * selection to (`activeSku`) -- same pattern as pdp-tabbed-detail.tsx and
 * pdp-long-scroll.tsx, see either's doc comment for the full mechanism. A
 * single-SKU product still renders exactly one add-to-cart row with no
 * picker chrome, byte-identical to before this story.
 */
export function PdpSpecSheet({
  demoSlug,
  viewModel,
  stockBySkuId = {},
  customizable = false,
  imageUrl,
  imageAlt,
  ratingSummary = null,
  reviews = [],
  activeSku,
  optionSelection,
}: {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  /** `null` means not inventory-tracked (always available, e.g. a bookable service) -- distinct from a real tracked 0. */
  stockBySkuId?: Record<string, number | null>;
  customizable?: boolean;
  /** image-cdn epic: same additive/optional resolved-photo props as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  imageUrl?: string | null;
  imageAlt?: string | null;
  /** bare-basics epic: same additive/optional rating-summary prop as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  ratingSummary?: { average: number; count: number; distribution: Record<number, number> } | null;
  /** bare-basics epic: same additive/optional published-reviews prop as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  reviews?: { id: string; rating: number; authorName: string; title: string; body: string; createdAt: string }[];
  /** pc-01: same additive/optional resolved-SKU/selection props as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  activeSku?: Sku;
  optionSelection?: Record<string, string>;
}) {
  const { product, skus, optionValues } = viewModel;
  const basePath = `/demo/${demoSlug}/products/${product.slug}`;

  const amounts = skus.map((sku) => sku.price.amount);
  const currency = skus[0]?.price.currency ?? "USD";
  const minPrice = amounts.length > 0 ? Math.min(...amounts) : 0;
  const maxPrice = amounts.length > 0 ? Math.max(...amounts) : 0;

  const anyInStock = skus.some((sku) => {
    const level = stockBySkuId[sku.id];
    return level === null || level === undefined || level > 0;
  });

  // Distinct identifying-attribute values actually present across this
  // product's real SKUs (same "never a theoretical cartesian product"
  // real-data-only convention as PdpViewModel.optionValues) -- one
  // datasheet-table row per identifying-attribute key.
  const valuesByKey = new Map<string, Set<string>>();
  for (const sku of skus) {
    for (const attr of sku.identifyingAttributes) {
      const set = valuesByKey.get(attr.key) ?? new Set<string>();
      set.add(String(attr.value));
      valuesByKey.set(attr.key, set);
    }
  }

  return (
    // a11y-audit: pdp-tabbed-detail.tsx and pdp-long-scroll.tsx (the other 2
    // registered PDP templates) both wrap their content in <main> -- this
    // one didn't, confirmed live via axe-core on the real
    // embroidered-performance-polo PDP under the datasheet theme:
    // "landmark-one-main" (document has no main landmark) plus 27
    // "region" (content outside any landmark) violations, all on this one
    // template. <main> replaces the outer <div> 1:1, same className, zero
    // other markup/behavior change.
    <main className="ds-scope ds-pdp">
      <style>{DS_ATOMS_CSS}</style>
      <style>{`
        .ds-pdp-grid {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 1px;
          background: var(--color-border, #D2D7E0);
          border: 1px solid var(--color-border, #D2D7E0);
        }
        .ds-pdp-art {
          background: #FFFFFF;
          padding: clamp(30px, 5vw, 64px);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background-image:
            linear-gradient(rgba(18, 21, 27, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(18, 21, 27, 0.07) 1px, transparent 1px);
          background-size: 16px 16px;
          font-family: ${DS_FONT_MONO};
          color: var(--color-muted, #626B78);
          text-align: center;
          font-size: 13px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ds-pdp-art.ds-pdp-art-photo { padding: 0; background-image: none; overflow: hidden; }
        .ds-pdp-art-photo img { width: 100%; height: 100%; min-height: 260px; object-fit: cover; display: block; }
        .ds-pdp-info { background: #FFFFFF; padding: clamp(24px, 4vw, 44px); display: flex; flex-direction: column; gap: 16px; }
        .ds-pdp-info h1 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: clamp(22px, 3vw, 30px);
          font-weight: 800;
          text-transform: uppercase;
          line-height: 1.15;
          margin: 0;
        }
        .ds-pdp-price-row { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
        .ds-pdp-price { font-family: ${DS_FONT_MONO}; font-size: 30px; font-weight: 600; color: var(--color-primary, #C8460A); }
        .ds-pdp-desc { color: var(--color-accent, #5A6170); font-size: 14.5px; line-height: 1.7; max-width: 58ch; margin: 0; }
        .ds-datasheet-table { border: 1px solid var(--color-border, #D2D7E0); }
        .ds-datasheet-table .ds-dh {
          font-family: ${DS_FONT_MONO};
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-muted, #626B78);
          padding: 9px 14px;
          background: var(--color-background, #E7EAF0);
          border-bottom: 1px solid var(--color-border, #D2D7E0);
        }
        .ds-datasheet-table .ds-dr {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 14px;
          border-top: 1px solid var(--color-border, #D2D7E0);
          font-size: 12.5px;
        }
        .ds-datasheet-table .ds-dr:first-of-type { border-top: none; }
        .ds-datasheet-table .ds-dr .ds-k {
          font-family: ${DS_FONT_MONO};
          color: var(--color-accent, #5A6170);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 11px;
        }
        .ds-datasheet-table .ds-dr .ds-v { font-family: ${DS_FONT_MONO}; color: var(--color-text, #12151B); text-align: right; font-weight: 500; }
        .ds-sku-row {
          border: 1px solid var(--color-border, #D2D7E0);
          padding: 14px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-bottom: var(--space-xs, 8px);
        }
        .ds-sku-attrs { font-family: ${DS_FONT_MONO}; font-size: 12px; color: var(--color-text, #12151B); flex: 1; min-width: 180px; }
        .ds-sku-price { font-family: ${DS_FONT_MONO}; font-size: 14px; color: var(--color-primary, #C8460A); font-weight: 600; }
        .ds-custom-note label { display: block; font-size: 12px; color: var(--color-accent, #5A6170); margin-bottom: 4px; }
        .ds-custom-note input[type="text"] {
          font-family: var(--font-family, sans-serif);
          border: 1px solid var(--color-muted, #AAB1BF);
          padding: 6px 8px;
          width: 100%;
          max-width: 320px;
        }
        .ds-rating { font-family: ${DS_FONT_MONO}; font-size: 12.5px; color: var(--color-accent, #5A6170); }
        .ds-rating-stars { color: var(--color-primary, #C8460A); }
        .ds-reviews { margin-top: 24px; border: 1px solid var(--color-border, #D2D7E0); padding: clamp(20px, 3vw, 32px); background: #FFFFFF; }
        .ds-review { padding: 12px 0; border-top: 1px solid var(--color-border, #D2D7E0); }
        .ds-review:first-of-type { border-top: none; padding-top: 0; }
        .ds-review-meta { font-family: ${DS_FONT_MONO}; font-size: 11px; color: var(--color-accent, #5A6170); text-transform: uppercase; letter-spacing: 0.04em; }
        .ds-review-body { font-size: 13.5px; color: var(--color-text, #12151B); line-height: 1.6; margin-top: 6px; }
        .ds-review-form label { display: block; font-family: ${DS_FONT_MONO}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-accent, #5A6170); margin-top: 12px; margin-bottom: 4px; }
        .ds-review-form input[type="text"], .ds-review-form select, .ds-review-form textarea {
          font-family: var(--font-family, sans-serif);
          border: 1px solid var(--color-muted, #AAB1BF);
          padding: 6px 8px;
          width: 100%;
          max-width: 420px;
        }
        @media (max-width: 860px) { .ds-pdp-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="ds-titleblock">
        <span className="ds-name">
          <span className="ds-num">SPEC-{product.id.slice(0, 6).toUpperCase()}</span>
          {product.status}
        </span>
        <span className="ds-meta">
          <span>{skus.length} SKU{skus.length === 1 ? "" : "S"}</span>
        </span>
      </div>

      <div className="ds-pdp-grid">
        <div className={imageUrl ? "ds-pdp-art ds-pdp-art-photo" : "ds-pdp-art"}>
          <span className="ds-tick tl" aria-hidden="true" />
          <span className="ds-tick tr" aria-hidden="true" />
          {imageUrl ? <img src={imageUrl} alt={imageAlt ?? ""} /> : <div>{product.title}</div>}
        </div>

        <div className="ds-pdp-info">
          <h1>{product.title}</h1>

          <div className="ds-pdp-price-row">
            <span className="ds-pdp-price">
              {minPrice === maxPrice
                ? `${(minPrice / 100).toFixed(2)} ${currency}`
                : `${(minPrice / 100).toFixed(2)}–${(maxPrice / 100).toFixed(2)} ${currency}`}
            </span>
            <span className={`ds-stock-badge${anyInStock ? "" : " out"}`}>{anyInStock ? "In stock" : "Out of stock"}</span>
          </div>

          {ratingSummary && ratingSummary.count > 0 && (
            <div className="ds-rating">
              <span className="ds-rating-stars">{ratingStars(ratingSummary.average)}</span>{" "}
              {ratingSummary.average.toFixed(1)} ({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})
            </div>
          )}

          <p className="ds-pdp-desc">{product.description}</p>

          <div className="ds-datasheet-table">
            <div className="ds-dh">Specifications</div>
            {[...valuesByKey.entries()].map(([key, values]) => (
              <div className="ds-dr" key={key}>
                <span className="ds-k">{key}</span>
                <span className="ds-v">{[...values].join(", ")}</span>
              </div>
            ))}
            <div className="ds-dr">
              <span className="ds-k">Status</span>
              <span className="ds-v">{product.status}</span>
            </div>
          </div>

          <div className="ds-label">Options</div>
          {skus.length > 1 && activeSku ? (
            <>
              <VariantPicker basePath={basePath} optionValues={optionValues} selection={optionSelection ?? {}} />
              <form action={addToCartAction} className="ds-sku-row">
                <input type="hidden" name="demoSlug" value={demoSlug} />
                <input type="hidden" name="skuId" value={activeSku.id} />
                <div className="ds-sku-attrs">
                  {activeSku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(" · ")}
                  <br />
                  <span className="ds-label">
                    {stockBySkuId[activeSku.id] == null ? "available" : `in stock: ${stockBySkuId[activeSku.id]}`}
                  </span>
                </div>
                <span className="ds-sku-price">
                  {(activeSku.price.amount / 100).toFixed(2)} {activeSku.price.currency}
                </span>
                <div className="ds-stepper">
                  <input type="number" name="quantity" defaultValue={1} min={1} aria-label="Quantity" />
                </div>
                {customizable && (
                  <div className="ds-custom-note">
                    <label htmlFor={`customizationNote-${activeSku.id}`}>Personalize (e.g. embroidery text, thread color)</label>
                    <input
                      id={`customizationNote-${activeSku.id}`}
                      type="text"
                      name="customizationNote"
                      placeholder="e.g. Text: Sarah -- thread color: navy"
                    />
                  </div>
                )}
                <button type="submit" className="ds-btn ds-btn-accent">
                  Add to cart
                </button>
              </form>
            </>
          ) : (
            skus.map((sku) => (
              <form action={addToCartAction} key={sku.id} className="ds-sku-row">
                <input type="hidden" name="demoSlug" value={demoSlug} />
                <input type="hidden" name="skuId" value={sku.id} />
                <div className="ds-sku-attrs">
                  {sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(" · ")}
                  <br />
                  <span className="ds-label">
                    {stockBySkuId[sku.id] == null ? "available" : `in stock: ${stockBySkuId[sku.id]}`}
                  </span>
                </div>
                <span className="ds-sku-price">
                  {(sku.price.amount / 100).toFixed(2)} {sku.price.currency}
                </span>
                <div className="ds-stepper">
                  <input type="number" name="quantity" defaultValue={1} min={1} aria-label="Quantity" />
                </div>
                {customizable && (
                  <div className="ds-custom-note">
                    <label htmlFor={`customizationNote-${sku.id}`}>Personalize (e.g. embroidery text, thread color)</label>
                    <input
                      id={`customizationNote-${sku.id}`}
                      type="text"
                      name="customizationNote"
                      placeholder="e.g. Text: Sarah -- thread color: navy"
                    />
                  </div>
                )}
                <button type="submit" className="ds-btn ds-btn-accent">
                  Add to cart
                </button>
              </form>
            ))
          )}
        </div>
      </div>

      <div className="ds-reviews">
        <div className="ds-dh">Reviews</div>
        {reviews.length > 0 ? (
          reviews.map((review) => (
            <div key={review.id} className="ds-review">
              <span className="ds-rating-stars">{ratingStars(review.rating)}</span>
              <div className="ds-review-meta">
                {review.title} -- {review.authorName} -- {review.createdAt}
              </div>
              <p className="ds-review-body">{review.body}</p>
            </div>
          ))
        ) : (
          <p className="ds-review-meta">No reviews yet -- be the first.</p>
        )}

        <div className="ds-review-form">
          <div className="ds-dh" style={{ marginTop: 20 }}>
            Write a review
          </div>
          <p className="ds-review-meta">Reviews are moderated before appearing publicly.</p>
          <form action={submitReviewAction}>
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="hidden" name="productId" value={product.id} />
            <label htmlFor="review-rating">Rating</label>
            <select id="review-rating" name="rating" defaultValue={5}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <label htmlFor="review-authorName">Name</label>
            <input id="review-authorName" type="text" name="authorName" required />
            <label htmlFor="review-title">Title</label>
            <input id="review-title" type="text" name="title" required />
            <label htmlFor="review-body">Review</label>
            <textarea id="review-body" name="body" required rows={4} />
            <button type="submit" className="ds-btn ds-btn-accent" style={{ marginTop: 12 }}>
              Submit review
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
