"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CreatePromotionInput } from "@mercatus-liber/promotions";
import { getOrCreateCartId, readCartId } from "./cart-cookie";
import { getOrCreateCustomerId } from "./customer-cookie";
import { getServices } from "./services";
import { THEME_COOKIE } from "./theme-cookie";

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

export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = String(formData.get("theme"));
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, { sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

/** Parses the promotions admin form fields shared by create and update. */
function parsePromotionFormData(formData: FormData): CreatePromotionInput {
  const code = String(formData.get("code") ?? "").trim();
  const targetSkuIds = String(formData.get("targetSkuIds") ?? "")
    .split(",")
    .map((skuId) => skuId.trim())
    .filter((skuId) => skuId.length > 0);
  const minCartAmount = String(formData.get("minCartAmount") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const usageLimit = String(formData.get("usageLimit") ?? "").trim();
  const status = String(formData.get("status") ?? "active");

  return {
    code: code.length > 0 ? code : null,
    kind: formData.get("kind") === "fixed" ? "fixed" : "percentage",
    scope: formData.get("scope") === "product" ? "product" : "cart",
    value: Number(formData.get("value") ?? 0),
    currency: String(formData.get("currency") ?? "USD"),
    targetSkuIds,
    minCartAmount: minCartAmount.length > 0 ? { amount: Number(minCartAmount), currency: String(formData.get("currency") ?? "USD") } : null,
    startsAt: startsAt.length > 0 ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    usageLimit: usageLimit.length > 0 ? Number(usageLimit) : null,
    status: status === "inactive" ? "inactive" : "active",
  };
}

export async function createPromotionAction(formData: FormData): Promise<void> {
  const { promotions } = await getServices();
  await promotions.createPromotion(parsePromotionFormData(formData));
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions");
}

export async function updatePromotionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const { promotions } = await getServices();
  const updated = await promotions.updatePromotion(id, parsePromotionFormData(formData));
  if (!updated) throw new Error(`No such promotion: ${id}`);
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions");
}

export async function deactivatePromotionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const { promotions } = await getServices();
  await promotions.deactivatePromotion(id);
  revalidatePath("/admin/promotions");
}
