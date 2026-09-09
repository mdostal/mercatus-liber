import { applyCouponAction, removeCartItemAction, startCheckoutAction, updateCartItemQuantityAction } from "../lib/actions";
import type { CartTemplateProps } from "./cart-standard";

/**
 * The "cart.receipt-style" template -- the real receipt-styled cart from
 * "The Slow Catalog"'s approved design mockup (design-discussion.md §1:
 * "receipt-styled cart"): a real `<table>` mirroring the mockup's
 * `.cart-table` (Libre Franklin headers, dashed row dividers, tabular-nums
 * money columns, Fraunces item titles, italic Newsreader variant/
 * personalization text) plus the mockup's `.cart-summary` card (dashed
 * subtotal/discount rows, a solid double-rule total). Wraps the exact same
 * real cart data as cart-standard.tsx, and submits through the exact same 4
 * server actions (quantity-update, remove-line, apply-coupon, checkout) --
 * only the surrounding markup/visual treatment differs, per this story's
 * "real interaction logic preserved, not reimplemented" requirement. Only
 * ever selected by the "editorial" bundle, so this file's styling is safe
 * to apply unconditionally.
 */
export function CartReceiptStyle({
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
  const checkoutLabel = paymentsMode === "sandbox" ? "Tender: Sandbox (demo)" : "Tender: Stripe";
  return (
    <main className="ed-cart">
      <style>{`
        .ed-cart { padding: 2rem 0 3rem; }
        .ed-cart h1 { font-family: var(--font-family-display, var(--font-family)); font-size: var(--font-size-heading-lg, 2.5rem); border-bottom: 1px solid var(--color-border, #C7B586); padding-bottom: 1rem; margin-bottom: 1.5rem !important; }
        .ed-cart-layout { display: grid; grid-template-columns: 1.7fr 1fr; gap: 2.5rem; align-items: start; }
        .ed-cart-table { width: 100%; border-collapse: collapse; font-family: var(--font-family); }
        .ed-cart-table thead th { text-align: left; font-family: var(--font-family); font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--color-muted, #7A6C58); padding-bottom: .5rem; border-bottom: 1px solid var(--color-border, #C7B586); }
        .ed-cart-table th.ed-num, .ed-cart-table td.ed-num { text-align: right; }
        .ed-cart-table td { padding: 1rem 0; border-bottom: 1px dashed var(--color-border, #DACFAF); vertical-align: top; }
        .ed-item-row { display: flex; align-items: center; gap: .75rem; }
        .ed-item-thumb { width: 3.5rem; height: 3.5rem; object-fit: cover; border-radius: var(--radius); flex-shrink: 0; }
        .ed-item-title { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: 1.05rem; }
        .ed-item-variant { font-family: var(--font-family); font-style: italic; color: var(--color-muted, #7A6C58); font-size: .88rem; margin-top: .2rem; }
        .ed-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ed-line-total { font-weight: 700; }
        .ed-line-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; margin-top: .6rem; font-family: var(--font-family); font-size: .82rem; color: var(--color-muted, #7A6C58); }
        .ed-line-controls input[type="number"] { width: 3.2rem; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: var(--color-background); color: var(--color-text); padding: .2rem .3rem; font-family: var(--font-family); }
        .ed-btn-ghost { font-family: var(--font-family); font-size: .78rem; font-weight: 700; letter-spacing: .02em; background: transparent; color: var(--color-primary); border: 1px solid var(--color-primary); border-radius: var(--radius); padding: .3rem .65rem; cursor: pointer; }
        .ed-btn-ghost:hover { background: var(--color-primary); color: var(--color-background); }
        .ed-coupon-form { margin-top: 2rem; display: flex; gap: .6rem; align-items: center; }
        .ed-coupon-form input[type="text"] { flex: 1; border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); background: var(--color-background); color: var(--color-text); padding: .55rem .75rem; font-family: var(--font-family); }
        .ed-coupon-note { font-family: var(--font-family); color: var(--color-muted, #7A6C58); font-size: .88rem; margin-top: .5rem !important; }
        .ed-summary { background: var(--color-surface, #FBF6E9); border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); padding: 1.5rem; box-shadow: var(--shadow-card, none); }
        .ed-summary .ed-row { display: flex; justify-content: space-between; font-family: var(--font-family); font-size: .92rem; padding: .5rem 0; }
        .ed-summary .ed-row.ed-muted { color: var(--color-muted, #7A6C58); font-size: .84rem; }
        .ed-summary .ed-row + .ed-row { border-top: 1px dashed var(--color-border, #DACFAF); }
        .ed-summary .ed-row.ed-total { border-top: 1px solid var(--color-text); margin-top: .3rem; padding-top: .9rem; font-weight: 800; font-size: 1.15rem; }
        .ed-btn-checkout { display: block; width: 100%; margin-top: 1.5rem; background: var(--color-primary); color: var(--color-background); border: 1px solid var(--color-primary); border-radius: var(--radius); font-family: var(--font-family); font-weight: 700; font-size: .92rem; letter-spacing: .02em; padding: 1rem; cursor: pointer; text-align: center; }
        .ed-btn-checkout:hover { filter: brightness(0.92); }
        @media (max-width: 900px) {
          .ed-cart-layout { grid-template-columns: 1fr; }
        }
      `}</style>

      <h1>Cart</h1>

      <div className="ed-cart-layout">
        <div>
          <table className="ed-cart-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="ed-num">Qty</th>
                <th className="ed-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.skuId}>
                  <td>
                    <div className="ed-item-row">
                      {line.imageUrl && <img className="ed-item-thumb" src={line.imageUrl} alt={line.imageAlt ?? ""} />}
                      <div>
                        <div className="ed-item-title">{line.title}</div>
                        {line.customizationNote && <div className="ed-item-variant">Personalization: {line.customizationNote}</div>}
                      </div>
                    </div>
                    <div className="ed-line-controls">
                      <form action={updateCartItemQuantityAction} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <input type="hidden" name="demoSlug" value={demoSlug} />
                        <input type="hidden" name="skuId" value={line.skuId} />
                        <input type="number" name="quantity" defaultValue={line.quantity} min={1} />
                        <button type="submit" className="ed-btn-ghost">
                          Update
                        </button>
                      </form>
                      <form action={removeCartItemAction}>
                        <input type="hidden" name="demoSlug" value={demoSlug} />
                        <input type="hidden" name="skuId" value={line.skuId} />
                        <button type="submit" className="ed-btn-ghost">
                          Remove
                        </button>
                      </form>
                    </div>
                  </td>
                  <td className="ed-num">{line.quantity}</td>
                  <td className="ed-num ed-line-total">
                    {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)} {line.priceSnapshot.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form className="ed-coupon-form" action={applyCouponAction}>
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="text" name="code" placeholder="Promo code" defaultValue={couponCode ?? ""} />
            <button type="submit" className="ed-btn-ghost">
              Apply
            </button>
          </form>
          {couponEnteredButInvalid && <p className="ed-coupon-note">Coupon code not valid</p>}
        </div>

        <aside className="ed-summary">
          <p className="ed-row">
            <span>Subtotal</span>
            <span className="ed-num">
              {(subtotalAmount / 100).toFixed(2)} {total.currency}
            </span>
          </p>
          {discountTotal.amount > 0 && (
            <p className="ed-row ed-muted">
              <span>Discount{appliedCode ? ` (${appliedCode})` : ""}</span>
              <span className="ed-num">
                -{(discountTotal.amount / 100).toFixed(2)} {discountTotal.currency}
              </span>
            </p>
          )}
          <p className="ed-row ed-total">
            <span>Total</span>
            <span className="ed-num">
              {(total.amount / 100).toFixed(2)} {total.currency}
            </span>
          </p>

          <form action={startCheckoutAction}>
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <button type="submit" className="ed-btn-checkout">
              {checkoutLabel}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
