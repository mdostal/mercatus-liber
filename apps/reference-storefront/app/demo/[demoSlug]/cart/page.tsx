import { notFound } from "next/navigation";
import { applyCouponAction, startCheckoutAction } from "../../../../lib/actions";
import { RecommendationShelf, resolveCartRecommendations } from "../../../../components/recommendation-shelf";
import { readCartId } from "../../../../lib/cart-cookie";
import { readCouponCode } from "../../../../lib/coupon-cookie";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function CartPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const cartId = await readCartId(demoSlug);
  const { cart, catalog, checkout, recommendations, marketingCatalog } = await getServicesForDemo(demoSlug);
  const currentCart = cartId ? await cart.getCart(cartId) : null;

  if (!cartId || !currentCart || currentCart.items.length === 0) {
    return (
      <main style={{ padding: "var(--space-sm, 16px)" }}>
        <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>Cart</h1>
        <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
          Your cart is empty. Take a look around and find something you like.
        </p>
      </main>
    );
  }

  const lines = await Promise.all(
    currentCart.items.map(async (item) => {
      const sku = await catalog.getSku(item.skuId);
      const product = sku ? await catalog.getProduct(sku.productId) : null;
      return {
        skuId: item.skuId,
        productId: product?.id ?? null,
        title: product?.title ?? `SKU ${item.skuId}`,
        quantity: item.quantity,
        priceSnapshot: item.priceSnapshot,
      };
    }),
  );

  // Recommendations composed at the app layer, same "no-op-when-absent"
  // pattern as the PDP page (see design-discussion.md §3): curated `cart`/
  // `both` rules unioned across every cart line's product, falling back to
  // the same-category heuristic per line with zero curated rules, deduped
  // and excluding anything already in the cart. packages/cart itself stays
  // untouched -- recommendations never becomes a cart-owned concept.
  const cartProductIds = Array.from(new Set(lines.map((line) => line.productId).filter((id): id is string => id !== null)));
  const recommendationShelf = await resolveCartRecommendations({ recommendations, catalog, marketingCatalog }, cartProductIds);

  const couponCode = await readCouponCode(demoSlug);
  const adjustment = await checkout.previewCheckout({ cartId, couponCode });
  // adjustment.total is already post-discount (see PricingAdjustment's doc
  // comment: sum(items[].unitAmount * quantity), where unitAmount is the
  // post-discount unit price) -- the pre-discount subtotal is total + discountTotal.
  const subtotalAmount = adjustment.total.amount + adjustment.discountTotal.amount;
  const couponEnteredButInvalid = couponCode !== null && adjustment.appliedCode === null;

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
              borderBottom: "1px solid var(--color-border, #e5e5e5)",
              paddingBottom: "var(--space-xs, 8px)",
              fontSize: "var(--font-size-body, 1rem)",
            }}
          >
            <span>
              {line.title} x{line.quantity}
            </span>
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
          Subtotal: {(subtotalAmount / 100).toFixed(2)} {adjustment.total.currency}
        </p>
        {adjustment.discountTotal.amount > 0 && (
          <p style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)", margin: "var(--space-xs, 8px) 0 0" }}>
            Discount{adjustment.appliedCode ? ` (${adjustment.appliedCode})` : ""}: -
            {(adjustment.discountTotal.amount / 100).toFixed(2)} {adjustment.discountTotal.currency}
          </p>
        )}
        <p style={{ fontSize: "var(--font-size-heading-md, 1.5rem)", fontWeight: "bold", margin: "var(--space-xs, 8px) 0 0" }}>
          Total: {(adjustment.total.amount / 100).toFixed(2)} {adjustment.total.currency}
        </p>
      </section>

      <form action={startCheckoutAction} style={{ marginTop: "var(--space-sm, 16px)" }}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <button type="submit">Check out with Stripe</button>
      </form>

      {recommendationShelf ? <RecommendationShelf {...recommendationShelf} /> : null}
    </main>
  );
}
