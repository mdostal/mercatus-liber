import type { PdpViewModel } from "@mercatus-liber/pdp";
import { addToCartAction, submitReviewAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";
import { readActiveThemeBundle } from "../lib/theme-cookie";

/** "★★★★☆"-style rendering of a rating (rounded to the nearest whole star), same convention as pdp-tabbed-detail.tsx's own ratingStars. */
function ratingStars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

type PdpReviewSummary = { average: number; count: number; distribution: Record<number, number> };
type PdpReview = { id: string; rating: number; authorName: string; title: string; body: string; createdAt: string };

type PdpLongScrollProps = {
  demoSlug: DemoSlug;
  viewModel: PdpViewModel;
  /** `null` means not inventory-tracked (always available, e.g. a bookable service) -- distinct from a real tracked 0. */
  stockBySkuId?: Record<string, number | null>;
  /** print-shop-02: same additive/optional personalization-input flag as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  customizable?: boolean;
  /** image-cdn epic: same additive/optional resolved-photo props as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  imageUrl?: string | null;
  imageAlt?: string | null;
  /** bare-basics epic: same additive/optional rating-summary prop as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  ratingSummary?: PdpReviewSummary | null;
  /** bare-basics epic: same additive/optional published-reviews prop as pdp-tabbed-detail.tsx -- see that component's doc comment. */
  reviews?: PdpReview[];
};

/**
 * The "pdp.long-scroll" template component -- same view-model data as
 * pdp-tabbed-detail, different presentation (everything inline, eBay-style,
 * no collapsing).
 *
 * This template is a SHARED fallback: "editorial", "minimal", "vibrant",
 * and "high-contrast" all set `defaultTemplatesByPageType.pdp:
 * "pdp.long-scroll"` (see packages/theming/src/theme-bundles.ts), so this
 * one component renders for 4 different bundles today. The rich "The Slow
 * Catalog" visual treatment (drop-cap body copy, Fraunces pricing, the
 * mockup's option/stock chrome) only belongs to "editorial" -- the other 3
 * bundles must keep rendering the exact original plain markup, byte-for-
 * byte. Since this component only receives `demoSlug`/`viewModel`/
 * `stockBySkuId`/`customizable` (no theme key prop -- adding one would mean
 * editing products/[slug]/page.tsx, outside this epic's file scope), it
 * resolves the active theme itself via the same `readActiveThemeBundle`
 * every page/layout already uses, and branches on `.key === "editorial"`.
 */
export async function PdpLongScroll({
  demoSlug,
  viewModel,
  stockBySkuId = {},
  customizable = false,
  imageUrl = null,
  imageAlt = null,
  ratingSummary = null,
  reviews = [],
}: PdpLongScrollProps) {
  const activeTheme = await readActiveThemeBundle(demoSlug);
  if (activeTheme.key === "editorial") {
    return (
      <EditorialPdpLongScroll
        demoSlug={demoSlug}
        viewModel={viewModel}
        stockBySkuId={stockBySkuId}
        customizable={customizable}
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        ratingSummary={ratingSummary}
        reviews={reviews}
      />
    );
  }

  const { product, skus, optionValues } = viewModel;

  return (
    <main>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={imageAlt ?? ""}
          style={{
            width: "100%",
            maxHeight: 480,
            objectFit: "cover",
            borderRadius: "var(--radius)",
            marginBottom: "var(--space-sm, 16px)",
          }}
        />
      )}
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{product.title}</h1>

      {ratingSummary && ratingSummary.count > 0 && (
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
          <span style={{ color: "var(--color-primary)" }}>{ratingStars(ratingSummary.average)}</span>{" "}
          {ratingSummary.average.toFixed(1)} ({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})
        </p>
      )}

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

      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Reviews</h2>
      {reviews.length > 0 ? (
        reviews.map((review) => (
          <div
            key={review.id}
            style={{
              borderTop: "1px solid var(--color-border, #e5e5e5)",
              paddingTop: "var(--space-xs, 8px)",
              marginTop: "var(--space-xs, 8px)",
            }}
          >
            <div style={{ color: "var(--color-primary)" }}>{ratingStars(review.rating)}</div>
            <strong style={{ fontSize: "var(--font-size-body, 1rem)" }}>{review.title}</strong>
            <div style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
              {review.authorName} -- {review.createdAt}
            </div>
            <p style={{ fontSize: "var(--font-size-body, 1rem)" }}>{review.body}</p>
          </div>
        ))
      ) : (
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
          No reviews yet -- be the first.
        </p>
      )}

      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Write a review</h2>
      <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
        Reviews are moderated before appearing publicly.
      </p>
      <form action={submitReviewAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="productId" value={product.id} />
        <div style={{ marginBottom: "var(--space-xs, 8px)" }}>
          <label htmlFor="review-rating" style={{ fontSize: "var(--font-size-body, 1rem)" }}>
            Rating
          </label>{" "}
          <select id="review-rating" name="rating" defaultValue={5}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "var(--space-xs, 8px)" }}>
          <label htmlFor="review-authorName" style={{ display: "block", fontSize: "var(--font-size-body, 1rem)" }}>
            Name
          </label>
          <input id="review-authorName" type="text" name="authorName" required style={{ width: "100%", maxWidth: 360 }} />
        </div>
        <div style={{ marginBottom: "var(--space-xs, 8px)" }}>
          <label htmlFor="review-title" style={{ display: "block", fontSize: "var(--font-size-body, 1rem)" }}>
            Title
          </label>
          <input id="review-title" type="text" name="title" required style={{ width: "100%", maxWidth: 360 }} />
        </div>
        <div style={{ marginBottom: "var(--space-xs, 8px)" }}>
          <label htmlFor="review-body" style={{ display: "block", fontSize: "var(--font-size-body, 1rem)" }}>
            Review
          </label>
          <textarea id="review-body" name="body" required style={{ width: "100%", maxWidth: 480 }} rows={4} />
        </div>
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
          Submit review
        </button>
      </form>
    </main>
  );
}

/**
 * "The Slow Catalog"'s real PDP treatment -- ported from the approved
 * mockup's `.pdp-layout`/`.pdp-info`/`.pdp-options`/`.pdp-desc`/`.dropcap`/
 * `.btn-add` CSS: a two-column layout (decorative placeholder image +
 * info column), Libre Franklin option chips (the mockup's swatch/size-tag
 * treatment, adapted -- this view model carries option VALUES, e.g.
 * `color: "walnut"`, not per-value hex swatches, so a real color swatch
 * dot isn't available data and isn't fabricated here), a live stock
 * indicator dot, and the mockup's serif drop-cap on the first paragraph of
 * real product description copy. Same real per-SKU add-to-cart forms/
 * server action as the shared branch above -- only presentation differs.
 */
function EditorialPdpLongScroll({
  demoSlug,
  viewModel,
  stockBySkuId,
  customizable,
  imageUrl,
  imageAlt,
  ratingSummary,
  reviews,
}: Required<Omit<PdpLongScrollProps, "viewModel">> & { viewModel: PdpViewModel }) {
  const { product, skus, optionValues } = viewModel;
  const firstWord = product.description.trim().slice(0, 1);
  const restOfDescription = product.description.trim().slice(1);

  return (
    <main className="ed-pdp">
      <style>{`
        .ed-pdp { padding: 2rem 0 3rem; }
        .ed-pdp-layout { display: grid; grid-template-columns: 1.05fr 1fr; gap: 3rem; align-items: start; }
        .ed-pdp-image { aspect-ratio: 1/1; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: linear-gradient(160deg, hsl(20 15% 18%), hsl(15 45% 30%)); overflow: hidden; }
        .ed-pdp-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ed-pdp-title { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: clamp(1.9rem, 3.2vw, 2.7rem); line-height: 1.05; margin-top: .4rem; }
        .ed-pdp-options { display: flex; gap: 1.75rem; flex-wrap: wrap; margin-top: 1.75rem; padding: 1.25rem 0; border-top: 1px solid var(--color-border, #DACFAF); border-bottom: 1px solid var(--color-border, #DACFAF); }
        .ed-opt { display: flex; flex-direction: column; gap: .4rem; font-family: var(--font-family); }
        .ed-opt-label { font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--color-muted, #7A6C58); }
        .ed-opt-value { display: flex; flex-wrap: wrap; gap: .4rem; }
        .ed-opt-tag { border: 1px solid var(--color-text); border-radius: var(--radius); padding: .18rem .6rem; font-size: .82rem; font-weight: 600; }
        .ed-pdp-desc { font-family: var(--font-family); font-size: 1.05rem; line-height: 1.7; color: var(--color-muted, #55493A); margin-top: 1.5rem; max-width: 54ch; }
        .ed-dropcap { float: left; font-family: var(--font-family-display, var(--font-family)); font-weight: 700; font-size: 3.2rem; line-height: .8; padding: .1em .12em 0 0; color: var(--color-primary); }
        .ed-sku-block { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px dashed var(--color-border, #DACFAF); }
        .ed-sku-block:first-of-type { border-top: none; margin-top: 1.5rem; padding-top: 0; }
        .ed-sku-attrs { font-family: var(--font-family); color: var(--color-muted, #7A6C58); font-size: .9rem; }
        .ed-sku-price { font-family: var(--font-family); font-weight: 800; font-size: 1.35rem; margin-top: .25rem; }
        .ed-sku-stock { margin-top: .5rem; font-family: var(--font-family); font-weight: 700; font-size: .84rem; display: flex; align-items: center; gap: .4rem; color: var(--color-accent, #5E6E45); }
        .ed-sku-stock::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent, #5E6E45); }
        .ed-sku-stock.ed-low::before { background: var(--color-primary); }
        .ed-sku-stock.ed-low { color: var(--color-primary); }
        .ed-qty-input { margin-top: .75rem; width: 3.5rem; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: var(--color-background); color: var(--color-text); padding: .3rem .4rem; font-family: var(--font-family); }
        .ed-personalize-label { display: block; margin-top: .75rem; font-family: var(--font-family); font-size: .85rem; color: var(--color-muted, #7A6C58); }
        .ed-personalize-input { width: 100%; max-width: 360px; margin-top: .3rem; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: var(--color-background); color: var(--color-text); padding: .5rem .65rem; font-family: var(--font-family); }
        .ed-btn-add { margin-top: 1.25rem; display: inline-flex; align-self: flex-start; background: var(--color-primary); color: var(--color-background); border: 1px solid var(--color-primary); border-radius: var(--radius); font-family: var(--font-family); font-weight: 700; font-size: .92rem; letter-spacing: .02em; padding: .85rem 1.75rem; cursor: pointer; }
        .ed-btn-add:hover { filter: brightness(0.9); }
        .ed-rating { margin-top: .5rem; font-family: var(--font-family); color: var(--color-muted, #55493A); font-size: .95rem; }
        .ed-rating-stars { color: var(--color-primary); }
        .ed-reviews { margin-top: 3rem; border-top: 1px solid var(--color-border, #DACFAF); padding-top: 1.5rem; }
        .ed-reviews-title { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: 1.4rem; }
        .ed-review { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--color-border, #DACFAF); }
        .ed-review:first-of-type { border-top: none; }
        .ed-review-meta { font-family: var(--font-family); color: var(--color-muted, #7A6C58); font-size: .85rem; }
        .ed-review-body { font-family: var(--font-family); font-size: .98rem; line-height: 1.6; margin-top: .3rem; }
        .ed-review-form label { display: block; margin-top: .75rem; font-family: var(--font-family); font-size: .85rem; color: var(--color-muted, #7A6C58); }
        .ed-review-form input[type="text"], .ed-review-form select, .ed-review-form textarea { width: 100%; max-width: 420px; margin-top: .3rem; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: var(--color-background); color: var(--color-text); padding: .5rem .65rem; font-family: var(--font-family); }
        @media (max-width: 900px) {
          .ed-pdp-layout { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ed-pdp-layout">
        {imageUrl ? (
          <div className="ed-pdp-image">
            <img src={imageUrl} alt={imageAlt ?? ""} />
          </div>
        ) : (
          <div className="ed-pdp-image" aria-hidden="true" />
        )}

        <div>
          <h1 className="ed-pdp-title">{product.title}</h1>

          {ratingSummary && ratingSummary.count > 0 && (
            <p className="ed-rating">
              <span className="ed-rating-stars">{ratingStars(ratingSummary.average)}</span>{" "}
              {ratingSummary.average.toFixed(1)} ({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})
            </p>
          )}

          {optionValues.length > 0 && (
            <div className="ed-pdp-options">
              {optionValues.map((option) => (
                <div className="ed-opt" key={option.key}>
                  <span className="ed-opt-label">{option.key}</span>
                  <span className="ed-opt-value">
                    {option.values.map((value) => (
                      <span className="ed-opt-tag" key={String(value)}>
                        {String(value)}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="ed-pdp-desc">
            <span className="ed-dropcap">{firstWord}</span>
            {restOfDescription}
          </p>

          {skus.map((sku) => {
            const stock = stockBySkuId[sku.id];
            const isLow = typeof stock === "number" && stock > 0 && stock <= 3;
            return (
              <form action={addToCartAction} key={sku.id} className="ed-sku-block">
                <input type="hidden" name="demoSlug" value={demoSlug} />
                <input type="hidden" name="skuId" value={sku.id} />
                {sku.identifyingAttributes.length > 0 && (
                  <div className="ed-sku-attrs">{sku.identifyingAttributes.map((a) => `${a.key}: ${String(a.value)}`).join(", ")}</div>
                )}
                <div className="ed-sku-price">
                  {(sku.price.amount / 100).toFixed(2)} {sku.price.currency}
                </div>
                <div className={`ed-sku-stock${isLow ? " ed-low" : ""}`}>
                  {stock == null ? "Available" : stock > 0 ? `In stock: ${stock}` : "Out of stock"}
                </div>
                <input type="number" name="quantity" defaultValue={1} min={1} className="ed-qty-input" />
                {customizable && (
                  <div>
                    <label className="ed-personalize-label" htmlFor={`customizationNote-${sku.id}`}>
                      Personalize this item (e.g. embroidery text, thread color)
                    </label>
                    <input
                      id={`customizationNote-${sku.id}`}
                      type="text"
                      name="customizationNote"
                      placeholder="e.g. Text: Sarah -- thread color: navy"
                      className="ed-personalize-input"
                    />
                  </div>
                )}
                <div>
                  <button type="submit" className="ed-btn-add">
                    Add to cart
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </div>

      <div className="ed-reviews">
        <h2 className="ed-reviews-title">Reviews</h2>
        {reviews.length > 0 ? (
          reviews.map((review) => (
            <div key={review.id} className="ed-review">
              <span className="ed-rating-stars">{ratingStars(review.rating)}</span>
              <div className="ed-review-meta">
                <strong>{review.title}</strong> -- {review.authorName} -- {review.createdAt}
              </div>
              <p className="ed-review-body">{review.body}</p>
            </div>
          ))
        ) : (
          <p className="ed-review-meta">No reviews yet -- be the first.</p>
        )}

        <div className="ed-review-form">
          <h2 className="ed-reviews-title">Write a review</h2>
          <p className="ed-review-meta">Reviews are moderated before appearing publicly.</p>
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
            <button type="submit" className="ed-btn-add">
              Submit review
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
