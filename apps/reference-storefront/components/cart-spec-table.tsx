import { applyCouponAction, removeCartItemAction, startCheckoutAction, updateCartItemQuantityAction } from "../lib/actions";
import { DS_ATOMS_CSS, DS_FONT_MONO } from "./datasheet-styles";
import type { CartTemplateProps } from "./cart-standard";

/**
 * The "cart.spec-table" template -- the real "Datasheet Storefront" cart,
 * ported from the approved mockup's `.cart-layout`/`.cart-items`/
 * `.cart-summary` rules (design-discussion.md §1: "spec-table PDP layout,
 * monospace pricing" applied here to the cart). Wraps the exact same real
 * cart data as cart-standard.tsx, and submits through the exact same 4
 * server actions (quantity-update, remove-line, apply-coupon, checkout) --
 * only the surrounding markup/visual treatment differs.
 */
export function CartSpecTable({
  demoSlug,
  lines,
  couponCode,
  couponEnteredButInvalid,
  subtotalAmount,
  discountTotal,
  total,
  appliedCode,
  paymentsMode,
}: CartTemplateProps) {
  const checkoutLabel = paymentsMode === "sandbox" ? "Check out (sandbox)" : "Check out with Stripe";
  return (
    <div className="ds-scope ds-cart">
      <style>{DS_ATOMS_CSS}</style>
      <style>{`
        .ds-cart main { padding: var(--space-sm, 16px); font-family: var(--font-family, sans-serif); }
        .ds-cart h1 {
          font-family: 'Archivo', system-ui, sans-serif;
          font-size: clamp(24px, 3.4vw, 34px);
          font-weight: 900;
          text-transform: uppercase;
          margin: 0 0 12px;
        }
        .ds-cart-layout {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 1px;
          background: var(--color-border, #D2D7E0);
          border: 1px solid var(--color-border, #D2D7E0);
          align-items: start;
        }
        .ds-cart-items { background: #FFFFFF; }
        .ds-cart-head-row, .ds-cart-row {
          display: grid;
          grid-template-columns: 1fr 110px 100px 110px 70px;
          gap: 10px;
          align-items: center;
        }
        .ds-cart-head-row {
          padding: 12px 20px;
          background: var(--color-background, #E7EAF0);
          border-bottom: 1px solid var(--color-border, #D2D7E0);
        }
        .ds-cart-head-row span {
          font-family: ${DS_FONT_MONO};
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-muted, #626B78);
        }
        .ds-cart-row { padding: 16px 20px; border-bottom: 1px solid var(--color-border, #D2D7E0); }
        .ds-cart-prod { display: flex; align-items: center; gap: 10px; }
        .ds-cart-prod-thumb { width: 44px; height: 44px; object-fit: cover; border: 1px solid var(--color-border, #D2D7E0); flex-shrink: 0; }
        .ds-cart-prod-text .ds-t { font-weight: 700; font-size: 13.5px; display: block; }
        .ds-cart-prod-text .ds-note {
          font-family: ${DS_FONT_MONO};
          font-size: 10.5px;
          color: var(--color-muted, #626B78);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ds-cart-row .ds-qty input {
          width: 48px;
          font-family: ${DS_FONT_MONO};
          border: 1px solid var(--color-muted, #AAB1BF);
          background: var(--color-background, #E7EAF0);
          text-align: center;
          padding: 4px 0;
        }
        .ds-cart-row .ds-price, .ds-cart-row .ds-total {
          font-family: ${DS_FONT_MONO};
          font-size: 13px;
          text-align: right;
        }
        .ds-cart-row .ds-total { font-weight: 600; }
        .ds-cart-row button {
          font-family: ${DS_FONT_MONO};
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: none;
          border: 1px solid var(--color-border, #D2D7E0);
          padding: 4px 6px;
          cursor: pointer;
          color: var(--color-accent, #5A6170);
        }
        .ds-cart-row button:hover { color: var(--color-primary, #C8460A); border-color: var(--color-primary, #C8460A); }
        .ds-cart-summary {
          background: #FFFFFF;
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 0;
          position: sticky;
          top: 16px;
        }
        .ds-cart-summary .ds-panel-title {
          font-family: ${DS_FONT_MONO};
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-muted, #626B78);
          padding-bottom: 14px;
          margin-bottom: 6px;
          border-bottom: 1px dashed var(--color-muted, #AAB1BF);
        }
        .ds-sum-row { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--color-border, #D2D7E0); font-size: 13px; }
        .ds-sum-row:first-of-type { border-top: none; }
        .ds-sum-row .ds-k { color: var(--color-accent, #5A6170); }
        .ds-sum-row .ds-v { font-family: ${DS_FONT_MONO}; }
        .ds-sum-row.ds-total-row {
          border-top: 2px solid var(--color-text, #12151B);
          margin-top: 6px;
          padding-top: 14px;
          font-size: 16px;
          font-weight: 700;
        }
        .ds-sum-row.ds-total-row .ds-v { font-size: 20px; color: var(--color-primary, #C8460A); }
        .ds-coupon-form { margin-top: var(--space-md, 32px); display: flex; gap: var(--space-xs, 8px); }
        .ds-coupon-form input[type="text"] {
          font-family: ${DS_FONT_MONO};
          border: 1px solid var(--color-muted, #AAB1BF);
          padding: 8px 10px;
        }
        @media (max-width: 860px) { .ds-cart-layout { grid-template-columns: 1fr; } }
        @media (max-width: 560px) {
          .ds-cart-head-row { display: none; }
          .ds-cart-row { grid-template-columns: 1fr; gap: 8px; }
          .ds-cart-row .ds-price { display: none; }
        }
      `}</style>

      <main>
        <div className="ds-titleblock">
          <span className="ds-name">
            <span className="ds-num">CART-01</span>
            Order Manifest
          </span>
          <span className="ds-meta">
            <span>{lines.length} LINE{lines.length === 1 ? "" : "S"}</span>
          </span>
        </div>

        <div className="ds-cart-layout">
          <div className="ds-cart-items">
            <div className="ds-cart-head-row">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Total</span>
              <span />
            </div>
            {lines.map((line) => (
              <div className="ds-cart-row" key={line.skuId}>
                <div className="ds-cart-prod">
                  {line.imageUrl && <img className="ds-cart-prod-thumb" src={line.imageUrl} alt={line.imageAlt ?? ""} />}
                  <div className="ds-cart-prod-text">
                    <span className="ds-t">{line.title}</span>
                    {line.customizationNote && <span className="ds-note">Custom: {line.customizationNote}</span>}
                  </div>
                </div>
                <form action={updateCartItemQuantityAction} className="ds-qty">
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="skuId" value={line.skuId} />
                  {/* a11y-audit: same unlabeled-quantity-input pattern found live via
                      axe-core (see cart-standard.tsx's own doc comment for the full
                      writeup) -- per-line aria-label disambiguates multiple cart rows. */}
                  <input
                    type="number"
                    name="quantity"
                    defaultValue={line.quantity}
                    min={1}
                    aria-label={`Quantity for ${line.title}`}
                  />
                </form>
                <span className="ds-price">
                  {(line.priceSnapshot.amount / 100).toFixed(2)} {line.priceSnapshot.currency}
                </span>
                <span className="ds-total">
                  {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)} {line.priceSnapshot.currency}
                </span>
                <form action={removeCartItemAction}>
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="skuId" value={line.skuId} />
                  <button type="submit">&times;</button>
                </form>
              </div>
            ))}
          </div>

          <div className="ds-cart-summary">
            <div className="ds-panel-title">Order Summary</div>
            <div className="ds-sum-row">
              <span className="ds-k">Subtotal</span>
              <span className="ds-v">
                {(subtotalAmount / 100).toFixed(2)} {total.currency}
              </span>
            </div>
            {discountTotal.amount > 0 && (
              <div className="ds-sum-row">
                <span className="ds-k">Discount{appliedCode ? ` (${appliedCode})` : ""}</span>
                <span className="ds-v">
                  -{(discountTotal.amount / 100).toFixed(2)} {discountTotal.currency}
                </span>
              </div>
            )}
            <div className="ds-sum-row ds-total-row">
              <span className="ds-k">Total</span>
              <span className="ds-v">
                {(total.amount / 100).toFixed(2)} {total.currency}
              </span>
            </div>

            <form action={applyCouponAction} className="ds-coupon-form">
              <input type="hidden" name="demoSlug" value={demoSlug} />
              <input type="text" name="code" placeholder="Coupon code" defaultValue={couponCode ?? ""} />
              <button type="submit" className="ds-btn ds-btn-outline">
                Apply
              </button>
            </form>
            {couponEnteredButInvalid && (
              <p className="ds-label" style={{ marginTop: 8 }}>
                Coupon code not valid
              </p>
            )}

            <form action={startCheckoutAction} style={{ marginTop: 16 }}>
              <input type="hidden" name="demoSlug" value={demoSlug} />
              <button type="submit" className="ds-btn ds-btn-accent ds-btn-block">
                {checkoutLabel}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
