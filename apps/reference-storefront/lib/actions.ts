"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOrCreateCartId, readCartId } from "./cart-cookie";
import { getOrCreateCustomerId } from "./customer-cookie";
import { getServices } from "./services";

export async function addToCartAction(formData: FormData): Promise<void> {
  const skuId = String(formData.get("skuId"));
  const quantity = Number(formData.get("quantity") ?? 1);
  const cartId = await getOrCreateCartId();
  const { cart } = await getServices();
  await cart.addItem(cartId, skuId, quantity);
  revalidatePath("/cart");
}

export async function startCheckoutAction(): Promise<void> {
  const cartId = await readCartId();
  if (!cartId) throw new Error("Cannot check out -- no cart exists yet.");

  const customerId = await getOrCreateCustomerId();
  const { checkout } = await getServices();
  const result = await checkout.startCheckout({
    cartId,
    // A real deployment derives this from the authenticated shopper's session;
    // the cart id is a reasonable idempotency anchor for this reference app
    // since each cart only checks out once in this minimal demo flow.
    idempotencyKey: cartId,
    customerId,
    shippingInfo: { name: "Demo Shopper", email: "demo@example.com", address: "1 Main St" },
    // Minimal demo simplification: a static confirmation page rather than a
    // dynamic /order/[id] redirect (which would need the order id embedded
    // before Stripe returns control -- a real deployment resolves this via
    // Stripe's {CHECKOUT_SESSION_ID} URL placeholder + a session-id lookup,
    // out of scope for this reference proof). /order/[id] still exists as a
    // standalone lookup page.
    successUrl: "http://localhost:3000/order/confirmed",
    cancelUrl: "http://localhost:3000/cart",
  });

  redirect(result.redirectUrl);
}
