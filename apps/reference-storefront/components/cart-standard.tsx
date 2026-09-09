import type { Money } from "@mercatus-liber/core";
import { applyCouponAction, removeCartItemAction, startCheckoutAction, updateCartItemQuantityAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

/** One cart line's display shape -- the app-layer view of a CartItem plus the product title cart/page.tsx already resolves via catalog. */
export interface CartTemplateLine {
  skuId: string;
  title: string;
  quantity: number;
  priceSnapshot: Money;
  /** print-shop-02: the personalization text captured on the PDP at add-to-cart time, if any (design-discussion.md §1b). Additive/optional -- absent for every non-customized line, same as before this field existed. */
  customizationNote?: string;
}

export interface CartTemplateProps {
  demoSlug: DemoSlug;
  lines: CartTemplateLine[];
  couponCode: string | null;
  couponEnteredButInvalid: boolean;
  subtotalAmount: number;
  discountTotal: Money;
  total: Money;
  appliedCode: string | null;
}

/**
 * The "cart.standard" template -- today's current cart layout, extracted
 * verbatim from app/demo/[demoSlug]/cart/page.tsx, PLUS real per-line
 * quantity-update/remove-line controls. packages/cart's updateQuantity/
 * removeItem were already real, tested service methods (see
 * packages/cart/src/service.ts) with no app-layer server action wired to
 * them before this story -- lib/actions.ts's new updateCartItemQuantityAction
 * / removeCartItemAction expose them, and this template wires them into
 * real <form action={...}> submissions per line, the exact same convention
 * addToCartAction's own per-SKU form already uses on the PDP. The coupon
 * and checkout forms below are unchanged, same actions as before.
 */
export function CartStandard({
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
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm, 16px)",
        }}
      >
        {lines.map((line) => (
          <li
            key={line.skuId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-xs, 8px)",
              borderBottom: "1px solid var(--color-border, #e5e5e5)",
              paddingBottom: "var(--space-xs, 8px)",
              fontSize: "var(--font-size-body, 1rem)",
            }}
          >
            <span>
              {line.title}
              {line.customizationNote && (
                <span
                  style={{
                    display: "block",
                    color: "var(--color-muted, #666)",
                    fontSize: "var(--font-size-body, 1rem)",
                  }}
                >
                  Personalization: {line.customizationNote}
                </span>
              )}
            </span>
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
              <button type="submit">Remove</button>
            </form>
            <span style={{ color: "var(--color-muted, #666)" }}>
              {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)} {line.priceSnapshot.currency}
            </span>
          </li>
        ))}
      </ul>

      <form action={applyCouponAction} style={{ marginTop: "var(--space-md, 32px)" }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="text" name="code" placeholder="Coupon code" defaultValue={couponCode ?? ""} />
        <button type="submit">Apply coupon</button>
      </form>
      {couponEnteredButInvalid && (
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>Coupon code not valid</p>
      )}

      <section
        style={{
          marginTop: "var(--space-md, 32px)",
          padding: "var(--space-sm, 16px)",
          border: "1px solid var(--color-border, #e5e5e5)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card, none)",
        }}
      >
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)", margin: 0 }}>
          Subtotal: {(subtotalAmount / 100).toFixed(2)} {total.currency}
        </p>
        {discountTotal.amount > 0 && (
          <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)", margin: "var(--space-xs, 8px) 0 0" }}>
            Discount{appliedCode ? ` (${appliedCode})` : ""}: -
            {(discountTotal.amount / 100).toFixed(2)} {discountTotal.currency}
          </p>
        )}
        <p style={{ fontSize: "var(--font-size-heading-md, 1.5rem)", fontWeight: "bold", margin: "var(--space-xs, 8px) 0 0" }}>
          Total: {(total.amount / 100).toFixed(2)} {total.currency}
        </p>
      </section>

      <form action={startCheckoutAction} style={{ marginTop: "var(--space-sm, 16px)" }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <button type="submit">Check out with Stripe</button>
      </form>
    </main>
  );
}
