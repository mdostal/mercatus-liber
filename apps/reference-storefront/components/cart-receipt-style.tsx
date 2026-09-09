import { applyCouponAction, removeCartItemAction, startCheckoutAction, updateCartItemQuantityAction } from "../lib/actions";
import type { CartTemplateProps } from "./cart-standard";

/**
 * The "cart.receipt-style" template -- monospace itemized-receipt visual
 * treatment per "The Slow Catalog" (design-discussion.md §1: "receipt-styled
 * cart"). Wraps the exact same real cart data as cart-standard.tsx, and
 * submits through the exact same 4 server actions (quantity-update,
 * remove-line, apply-coupon, checkout) -- only the surrounding markup/visual
 * treatment differs, per this story's "real interaction logic preserved,
 * not reimplemented" requirement.
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
}: CartTemplateProps) {
  return (
    <main
      style={{
        padding: "var(--space-sm, 16px)",
        fontFamily: "ui-monospace, 'Courier New', monospace",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-heading-lg, 2.5rem)",
          textAlign: "center",
          borderBottom: "2px dashed var(--color-border, #e5e5e5)",
          paddingBottom: "var(--space-xs, 8px)",
        }}
      >
        Receipt
      </h1>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {lines.map((line) => (
          <li
            key={line.skuId}
            style={{
              borderBottom: "1px dashed var(--color-border, #e5e5e5)",
              padding: "var(--space-xs, 8px) 0",
              fontSize: "var(--font-size-body, 1rem)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{line.title}</span>
              <span>
                {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)} {line.priceSnapshot.currency}
              </span>
            </div>
            {line.customizationNote && (
              <div style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
                Personalization: {line.customizationNote}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "var(--space-xs, 8px)",
                marginTop: "var(--space-xs, 8px)",
                color: "var(--color-muted, #666)",
              }}
            >
              <span>qty {line.quantity}</span>
              <form
                action={updateCartItemQuantityAction}
                style={{ display: "flex", alignItems: "center", gap: "var(--space-xs, 8px)" }}
              >
                <input type="hidden" name="demoSlug" value={demoSlug} />
                <input type="hidden" name="skuId" value={line.skuId} />
                <input type="number" name="quantity" defaultValue={line.quantity} min={1} style={{ width: 48 }} />
                <button type="submit">Update</button>
              </form>
              <form action={removeCartItemAction}>
                <input type="hidden" name="demoSlug" value={demoSlug} />
                <input type="hidden" name="skuId" value={line.skuId} />
                <button type="submit">Void line</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <form
        action={applyCouponAction}
        style={{
          marginTop: "var(--space-md, 32px)",
          borderTop: "1px dashed var(--color-border, #e5e5e5)",
          paddingTop: "var(--space-xs, 8px)",
        }}
      >
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="text" name="code" placeholder="Promo code" defaultValue={couponCode ?? ""} />
        <button type="submit">Apply</button>
      </form>
      {couponEnteredButInvalid && (
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>Coupon code not valid</p>
      )}

      <section
        style={{
          marginTop: "var(--space-md, 32px)",
          borderTop: "2px dashed var(--color-border, #e5e5e5)",
          paddingTop: "var(--space-xs, 8px)",
        }}
      >
        <p style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-body, 1rem)", margin: 0 }}>
          <span>Subtotal</span>
          <span>
            {(subtotalAmount / 100).toFixed(2)} {total.currency}
          </span>
        </p>
        {discountTotal.amount > 0 && (
          <p
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--color-muted, #666)",
              fontSize: "var(--font-size-body, 1rem)",
              margin: "var(--space-xs, 8px) 0 0",
            }}
          >
            <span>Discount{appliedCode ? ` (${appliedCode})` : ""}</span>
            <span>
              -{(discountTotal.amount / 100).toFixed(2)} {discountTotal.currency}
            </span>
          </p>
        )}
        <p
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--font-size-heading-md, 1.5rem)",
            fontWeight: "bold",
            borderTop: "1px dashed var(--color-border, #e5e5e5)",
            margin: "var(--space-xs, 8px) 0 0",
            paddingTop: "var(--space-xs, 8px)",
          }}
        >
          <span>Total</span>
          <span>
            {(total.amount / 100).toFixed(2)} {total.currency}
          </span>
        </p>
      </section>

      <form action={startCheckoutAction} style={{ marginTop: "var(--space-sm, 16px)", textAlign: "center" }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <button type="submit">Tender: Stripe</button>
      </form>
    </main>
  );
}
