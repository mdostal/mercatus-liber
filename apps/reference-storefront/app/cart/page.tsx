import { startCheckoutAction } from "../../lib/actions";
import { readCartId } from "../../lib/cart-cookie";
import { getServices } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cartId = await readCartId();
  const { cart, catalog } = await getServices();
  const currentCart = cartId ? await cart.getCart(cartId) : null;

  if (!currentCart || currentCart.items.length === 0) {
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
      <form action={startCheckoutAction}>
        <button type="submit">Check out with Stripe</button>
      </form>
    </main>
  );
}
