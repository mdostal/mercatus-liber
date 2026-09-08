import { applyCouponAction, startCheckoutAction } from "../../lib/actions";
import { readCartId } from "../../lib/cart-cookie";
import { readCouponCode } from "../../lib/coupon-cookie";
import { getServices } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cartId = await readCartId();
  const { cart, catalog, checkout } = await getServices();
  const currentCart = cartId ? await cart.getCart(cartId) : null;

  if (!cartId || !currentCart || currentCart.items.length === 0) {
    return (
      <main>
        <h1>Cart</h1>
        <p>Your cart is empty. Browse the catalog and add something.</p>
      </main>
    );
  }

  const lines = await Promise.all(
    currentCart.items.map(async (item) => {
      const sku = await catalog.getSku(item.skuId);
      const product = sku ? await catalog.getProduct(sku.productId) : null;
      return {
        skuId: item.skuId,
        title: product?.title ?? `SKU ${item.skuId}`,
        quantity: item.quantity,
        priceSnapshot: item.priceSnapshot,
      };
    }),
  );

  const couponCode = await readCouponCode();
  const adjustment = await checkout.previewCheckout({ cartId, couponCode });
  // adjustment.total is already post-discount (see PricingAdjustment's doc
  // comment: sum(items[].unitAmount * quantity), where unitAmount is the
  // post-discount unit price) -- the pre-discount subtotal is total + discountTotal.
  const subtotalAmount = adjustment.total.amount + adjustment.discountTotal.amount;
  const couponEnteredButInvalid = couponCode !== null && adjustment.appliedCode === null;

  return (
    <main>
      <h1>Cart</h1>
      <ul>
        {lines.map((line) => (
          <li key={line.skuId}>
            {line.title} x{line.quantity} -- {((line.priceSnapshot.amount * line.quantity) / 100).toFixed(2)}{" "}
            {line.priceSnapshot.currency}
          </li>
        ))}
      </ul>

      <form action={applyCouponAction}>
        <input type="text" name="code" placeholder="Coupon code" defaultValue={couponCode ?? ""} />
        <button type="submit">Apply coupon</button>
      </form>
      {couponEnteredButInvalid && <p>Coupon code not valid</p>}

      <section>
        <p>
          Subtotal: {(subtotalAmount / 100).toFixed(2)} {adjustment.total.currency}
        </p>
        {adjustment.discountTotal.amount > 0 && (
          <p>
            Discount{adjustment.appliedCode ? ` (${adjustment.appliedCode})` : ""}: -
            {(adjustment.discountTotal.amount / 100).toFixed(2)} {adjustment.discountTotal.currency}
          </p>
        )}
        <p>
          Total: {(adjustment.total.amount / 100).toFixed(2)} {adjustment.total.currency}
        </p>
      </section>

      <form action={startCheckoutAction}>
        <button type="submit">Check out with Stripe</button>
      </form>
    </main>
  );
}
