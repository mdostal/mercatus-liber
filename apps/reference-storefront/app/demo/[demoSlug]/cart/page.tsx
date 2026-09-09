import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { CartReceiptStyle } from "../../../../components/cart-receipt-style";
import { CartSpecTable } from "../../../../components/cart-spec-table";
import { CartStandard, type CartTemplateProps } from "../../../../components/cart-standard";
import { RecommendationShelf, resolveCartRecommendations } from "../../../../components/recommendation-shelf";
import { readCartId } from "../../../../lib/cart-cookie";
import { readCouponCode } from "../../../../lib/coupon-cookie";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";
import { readActiveThemeBundle } from "../../../../lib/theme-cookie";

export const dynamic = "force-dynamic";

/**
 * Template-key -> component map, the app-layer half of the theming
 * contract (mirrors products/[slug]/page.tsx's PDP_TEMPLATES map exactly).
 * Adding a new registered "cart" template requires one more entry here.
 */
const CART_TEMPLATES = {
  "cart.standard": CartStandard,
  "cart.receipt-style": CartReceiptStyle,
  "cart.spec-table": CartSpecTable,
} as const;

export default async function CartPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const cartId = await readCartId(demoSlug);
  const { cart, catalog, checkout, recommendations, marketingCatalog, theming, confirmSandboxPayment } =
    await getServicesForDemo(demoSlug);
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
        // print-shop-02: additive/optional (design-discussion.md §1b) --
        // absent for every non-customized line, same as before this field existed.
        customizationNote: item.customizationNote,
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

  // Same override-from-active-bundle pattern PDP already uses: the active
  // theme bundle's own defaultTemplatesByPageType.cart is passed as the
  // explicit override (undefined for the 7 pre-existing bundles, which
  // don't define one, so resolveTemplate falls back to its own
  // first-registered-template default, "cart.standard").
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateKey = theming.resolveTemplate("cart", activeTheme.defaultTemplatesByPageType.cart);
  const Template: ComponentType<CartTemplateProps> =
    (templateKey && CART_TEMPLATES[templateKey as keyof typeof CART_TEMPLATES]) || CartStandard;

  return (
    <>
      <Template
        demoSlug={demoSlug}
        lines={lines.map(({ skuId, title, quantity, priceSnapshot, customizationNote }) => ({
          skuId,
          title,
          quantity,
          priceSnapshot,
          customizationNote,
        }))}
        couponCode={couponCode}
        couponEnteredButInvalid={couponEnteredButInvalid}
        subtotalAmount={subtotalAmount}
        discountTotal={adjustment.discountTotal}
        total={adjustment.total}
        appliedCode={adjustment.appliedCode}
        themeKey={activeTheme.key}
        paymentsMode={confirmSandboxPayment ? "sandbox" : "stripe"}
      />
      {recommendationShelf ? <RecommendationShelf {...recommendationShelf} /> : null}
    </>
  );
}
