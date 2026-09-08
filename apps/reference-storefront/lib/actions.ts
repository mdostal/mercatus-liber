"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { BundleTier, CreateBundleInput } from "@mercatus-liber/bundles";
import type { CreatePromotionInput } from "@mercatus-liber/promotions";
import { getOrCreateCartId, readCartId } from "./cart-cookie";
import { readCouponCode, setCouponCode } from "./coupon-cookie";
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

/**
 * The multi-SKU sibling of addToCartAction -- "add a bundle tier to cart" is
 * app-layer orchestration, not a new cart capability (see
 * design-discussion.md §3). Resolves the tier's skuIds via the bundles
 * service, then calls cart's existing addItem once per constituent SKU at
 * quantity 1 (a tier selection is "one of this configuration," not a
 * quantity control -- see bundle-02's design_decisions). Submitting the same
 * tier twice naturally yields quantity 2 per SKU via addItem's existing
 * same-skuId-merges-quantity behavior -- no special dedup logic needed here.
 */
export async function addBundleTierToCartAction(formData: FormData): Promise<void> {
  const bundleId = String(formData.get("bundleId"));
  const tierId = String(formData.get("tierId"));
  const cartId = await getOrCreateCartId();
  const { bundles, cart } = await getServices();

  const bundle = await bundles.getBundle(bundleId);
  const tier = bundle?.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`No such bundle tier: ${bundleId}/${tierId}`);

  for (const skuId of tier.skuIds) {
    await cart.addItem(cartId, skuId, 1);
  }
  revalidatePath("/cart");
}

export async function applyCouponAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  await setCouponCode(code);
  revalidatePath("/cart");
}

export async function startCheckoutAction(): Promise<void> {
  const cartId = await readCartId();
  if (!cartId) throw new Error("Cannot check out -- no cart exists yet.");

  const customerId = await getOrCreateCustomerId();
  const couponCode = await readCouponCode();
  const { checkout } = await getServices();
  const result = await checkout.startCheckout({
    cartId,
    // A real deployment derives this from the authenticated shopper's session;
    // the cart id is a reasonable idempotency anchor for this reference app
    // since each cart only checks out once in this minimal demo flow.
    idempotencyKey: cartId,
    customerId,
    couponCode,
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

/** Matches BundleFormFields' fixed number of tier slots. */
const BUNDLE_TIER_SLOTS = 5;

/**
 * Parses the bundles admin form's fixed, indexed tier slots (tier_0_label/
 * tier_0_skuIds/tier_0_id, tier_1_..., ...) shared by create and update. A
 * slot with a blank label AND blank skuIds is treated as unused and omitted
 * from the result -- see BundleFormFields' doc comment. skuIds is a single
 * comma-or-newline-separated textarea per tier. Each included tier keeps its
 * existing id (from the hidden tier_N_id field, edit forms only) or gets a
 * freshly generated one (create forms, or a genuinely new slot on an edit).
 */
function parseBundleFormData(formData: FormData): CreateBundleInput {
  const tiers: BundleTier[] = [];
  for (let i = 0; i < BUNDLE_TIER_SLOTS; i++) {
    const label = String(formData.get(`tier_${i}_label`) ?? "").trim();
    const skuIds = String(formData.get(`tier_${i}_skuIds`) ?? "")
      .split(/[,\n]/)
      .map((skuId) => skuId.trim())
      .filter((skuId) => skuId.length > 0);
    if (label.length === 0 && skuIds.length === 0) continue;
    const existingId = String(formData.get(`tier_${i}_id`) ?? "").trim();
    tiers.push({ id: existingId.length > 0 ? existingId : randomUUID(), label, skuIds });
  }

  const status = String(formData.get("status") ?? "active");

  return {
    productId: String(formData.get("productId") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    tiers,
    status: status === "inactive" ? "inactive" : "active",
  };
}

export async function createBundleAction(formData: FormData): Promise<void> {
  const { bundles } = await getServices();
  await bundles.createBundle(parseBundleFormData(formData));
  revalidatePath("/admin/bundles");
  redirect("/admin/bundles");
}

export async function updateBundleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const { bundles } = await getServices();
  const updated = await bundles.updateBundle(id, parseBundleFormData(formData));
  if (!updated) throw new Error(`No such bundle: ${id}`);
  revalidatePath("/admin/bundles");
  redirect("/admin/bundles");
}

export async function deactivateBundleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const { bundles } = await getServices();
  await bundles.deactivateBundle(id);
  revalidatePath("/admin/bundles");
}
