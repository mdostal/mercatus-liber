import { applyCouponAction, removeCartItemAction, startCheckoutAction, updateCartItemQuantityAction } from "../lib/actions";
import type { CartTemplateProps } from "./cart-standard";

/**
 * The "cart.spec-table" template -- a literal data-table layout per
 * "Datasheet Storefront" (design-discussion.md §1: "spec-table PDP layout,
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
}: CartTemplateProps) {
  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>Cart</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-body, 1rem)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border, #e5e5e5)" }}>
            <th style={{ textAlign: "left", padding: "var(--space-xs, 8px)" }}>Item</th>
            <th style={{ textAlign: "right", padding: "var(--space-xs, 8px)" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "var(--space-xs, 8px)" }}>Unit</th>
            <th style={{ textAlign: "right", padding: "var(--space-xs, 8px)" }}>Line total</th>
            <th style={{ padding: "var(--space-xs, 8px)" }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.skuId} style={{ borderBottom: "1px solid var(--color-border, #e5e5e5)" }}>
              <td style={{ padding: "var(--space-xs, 8px)" }}>{line.title}</td>
              <td style={{ padding: "var(--space-xs, 8px)", textAlign: "right" }}>
                <form
                  action={updateCartItemQuantityAction}
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs, 8px)" }}
                >
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="skuId" value={line.skuId} />
                  <input type="number" name="quantity" defaultValue={line.quantity} min={1} style={{ width: 48 }} />
                  <button type="submit">Update</button>
                </form>
              </td>
              <td style={{ padding: "var(--space-xs, 8px)", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>
                {(line.priceSnapshot.amount / 100).toFixed(2)} {line.priceSnapshot.currency}
              </td>
              <td style={{ padding: "var(--space-xs, 8px)", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>
                {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)} {line.priceSnapshot.currency}
              </td>
              <td style={{ padding: "var(--space-xs, 8px)", textAlign: "right" }}>
                <form action={removeCartItemAction}>
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="skuId" value={line.skuId} />
                  <button type="submit">Remove</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ padding: "var(--space-xs, 8px)", color: "var(--color-muted, #666)" }}>
              Subtotal
            </td>
            <td
              colSpan={2}
              style={{ padding: "var(--space-xs, 8px)", textAlign: "right", fontFamily: "ui-monospace, monospace" }}
            >
              {(subtotalAmount / 100).toFixed(2)} {total.currency}
            </td>
          </tr>
          {discountTotal.amount > 0 && (
            <tr>
              <td colSpan={3} style={{ padding: "var(--space-xs, 8px)", color: "var(--color-muted, #666)" }}>
                Discount{appliedCode ? ` (${appliedCode})` : ""}
              </td>
              <td
                colSpan={2}
                style={{ padding: "var(--space-xs, 8px)", textAlign: "right", fontFamily: "ui-monospace, monospace" }}
              >
                -{(discountTotal.amount / 100).toFixed(2)} {discountTotal.currency}
              </td>
            </tr>
          )}
          <tr style={{ borderTop: "1px solid var(--color-border, #e5e5e5)" }}>
            <td colSpan={3} style={{ padding: "var(--space-xs, 8px)", fontWeight: "bold" }}>
              Total
            </td>
            <td
              colSpan={2}
              style={{
                padding: "var(--space-xs, 8px)",
                textAlign: "right",
                fontWeight: "bold",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {(total.amount / 100).toFixed(2)} {total.currency}
            </td>
          </tr>
        </tfoot>
      </table>

      <form
        action={applyCouponAction}
        style={{ marginTop: "var(--space-md, 32px)", display: "flex", gap: "var(--space-xs, 8px)" }}
      >
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="text" name="code" placeholder="Coupon code" defaultValue={couponCode ?? ""} />
        <button type="submit">Apply coupon</button>
      </form>
      {couponEnteredButInvalid && (
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>Coupon code not valid</p>
      )}

      <form action={startCheckoutAction} style={{ marginTop: "var(--space-sm, 16px)" }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <button type="submit">Check out with Stripe</button>
      </form>
    </main>
  );
}
