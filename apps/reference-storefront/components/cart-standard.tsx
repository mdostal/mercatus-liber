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
  /** image-cdn epic: a small real thumbnail for this line's product, resolved through @mercatus-liber/media's ImageAdapter by cart/page.tsx -- see lib/product-image.ts. `null`/undefined (no `images` yet, or no resolvable product) renders nothing extra, byte-for-byte what each cart template rendered before this field existed. */
  imageUrl?: string | null;
  imageAlt?: string | null;
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
  /**
   * visual-fidelity-maximalist: additive/optional -- the active theme
   * bundle's key, threaded in only so this shared template (used by 8 of
   * the 10 bundles, "cart.standard" is still every one of the 7
   * pre-existing bundles' + "maximalist"'s registered cart template) can
   * apply the real "Blaze Theme" cart CSS ONLY when "maximalist" is active.
   * Every other bundle either omits this prop or passes a different key,
   * both of which render byte-for-byte what this template rendered before
   * this field existed.
   */
  themeKey?: string;
  /**
   * sandbox-checkout epic: "sandbox" whenever this deployment has no real
   * STRIPE_SECRET_KEY configured (see lib/services.ts's payments branch) --
   * every one of this app's 3 cart templates previously hardcoded "Check
   * out with Stripe"/"Tender: Stripe" regardless of which PaymentAdapter
   * was actually wired, which became actively misleading once
   * createSandboxPaymentAdapter became this app's real default (no charge
   * is ever made in that mode). Optional so a template that hasn't been
   * updated to read it yet (none currently) still renders, defaulting to
   * the pre-existing "Stripe" copy.
   */
  paymentsMode?: "sandbox" | "stripe";
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
  themeKey,
  paymentsMode,
}: CartTemplateProps) {
  const isMaximalist = themeKey === "maximalist";
  const checkoutLabel = paymentsMode === "sandbox" ? "Check out (sandbox demo)" : "Check out with Stripe";

  return (
    <main className={isMaximalist ? "mx-cart" : undefined} style={{ padding: "var(--space-sm, 16px)" }}>
      {isMaximalist && <style>{MX_CART_CSS}</style>}
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>Cart</h1>
      <ul
        className={isMaximalist ? "mx-cart-lines" : undefined}
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
            className={isMaximalist ? "mx-line-item" : undefined}
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
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs, 8px)" }}>
              {line.imageUrl && (
                <img
                  src={line.imageUrl}
                  alt={line.imageAlt ?? ""}
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0 }}
                />
              )}
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
            </span>
            <form
              action={updateCartItemQuantityAction}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-xs, 8px)" }}
            >
              <input type="hidden" name="demoSlug" value={demoSlug} />
              <input type="hidden" name="skuId" value={line.skuId} />
              {/* a11y-audit: confirmed live via axe-core (northline PDP's own add-to-cart
                  quantity input surfaced the same pattern, "critical" impact -- no
                  implicit/explicit label, no aria-label, no title/placeholder). A per-line
                  aria-label (not a bare "Quantity") also disambiguates multiple cart lines
                  for screen-reader users, who otherwise hear identical "Quantity" fields
                  with no way to tell them apart. */}
              <input
                type="number"
                name="quantity"
                defaultValue={line.quantity}
                min={1}
                aria-label={`Quantity for ${line.title}`}
                style={{ width: 48 }}
              />
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
        className={isMaximalist ? "mx-cart-summary" : undefined}
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
        <button type="submit">{checkoutLabel}</button>
      </form>
    </main>
  );
}

/**
 * visual-fidelity-maximalist: the real ported "Blaze Theme" cart CSS
 * (mockup's `.line-item`/`.cart-summary`) -- thick 3px borders, hard offset
 * shadows, the accent-2/cream cart-summary treatment. Only ever rendered
 * when `themeKey === "maximalist"` (see `isMaximalist` above), so this has
 * zero visual effect on the 7 other bundles that also render this exact
 * component (classic/dark/minimal/vibrant/retro/high-contrast/northline).
 * `mx-`-prefixed classes throughout per this epic's collision-avoidance
 * convention.
 */
const MX_CART_CSS = `
  .mx-cart h1 {
    font-family: 'Anton', 'Archivo Black', Impact, ui-sans-serif, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.01em;
  }
  .mx-cart-lines.mx-cart-lines { gap: 16px; }
  .mx-cart .mx-line-item {
    background: #fff;
    border: 3px solid var(--color-border, #17130F) !important;
    border-radius: 14px !important;
    box-shadow: 6px 6px 0 var(--color-border, #17130F) !important;
    padding: 14px 18px !important;
  }
  .mx-cart .mx-line-item form button[type="submit"] {
    font-family: var(--font-family, 'Archivo', sans-serif);
    font-weight: 800;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.04em;
    border: 2.5px solid var(--color-border, #17130F);
    border-radius: 8px;
    background: #fff;
    padding: 6px 10px;
    box-shadow: 3px 3px 0 var(--color-border, #17130F);
    cursor: pointer;
  }
  .mx-cart .mx-line-item span:last-child {
    font-family: 'Space Mono', ui-monospace, monospace;
    font-weight: 700;
    font-size: 16px;
    color: var(--color-text, #17130F) !important;
  }
  .mx-cart form[action] > button[type="submit"] {
    font-family: var(--font-family, 'Archivo', sans-serif);
    font-weight: 800;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.04em;
    border: 3px solid var(--color-border, #17130F);
    border-radius: 10px;
    background: var(--color-primary, #FF4515);
    color: var(--color-text, #17130F);
    padding: 10px 20px;
    box-shadow: 5px 5px 0 var(--color-border, #17130F);
    cursor: pointer;
  }
  .mx-cart-summary.mx-cart-summary {
    background: var(--color-accent, #263B8C) !important;
    color: #F3EFE4 !important;
    border: 3px solid var(--color-border, #17130F) !important;
    border-radius: 16px !important;
    box-shadow: 9px 9px 0 var(--color-border, #17130F) !important;
    padding: 22px !important;
  }
  .mx-cart-summary p { color: #F3EFE4 !important; font-family: 'Space Mono', ui-monospace, monospace; }
  .mx-cart-summary form[action] > button[type="submit"] {
    width: 100%;
    justify-content: center;
    background: #fff;
    color: var(--color-text, #17130F);
  }
`;
