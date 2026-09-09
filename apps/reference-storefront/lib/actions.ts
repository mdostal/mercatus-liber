"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_DEV_SESSION_COOKIE,
  hasPermission,
  verifyDevPassword,
  type AdminAction,
  type AdminRole,
} from "@mercatus-liber/admin-auth";
import type { BundleTier, CreateBundleInput } from "@mercatus-liber/bundles";
import type { CreateCampaignInput, Creative } from "@mercatus-liber/advertising";
import type { ComponentInstance, PageType } from "@mercatus-liber/cms";
import type { CreatePromotionInput } from "@mercatus-liber/promotions";
import type { CreateRuleInput } from "@mercatus-liber/recommendations";
import { getOrCreateCartId, readCartId } from "./cart-cookie";
import { readCouponCode, setCouponCode } from "./coupon-cookie";
import { getOrCreateCustomerId } from "./customer-cookie";
import { isDemoSlug, type DemoSlug } from "./demos";
import { getServicesForDemo } from "./services";
import { themeCookieName } from "./theme-cookie";

/**
 * demo-routing-04: every one of this file's "use server" actions is bound
 * to a `<form action={...}>` a Server Action doesn't automatically receive
 * route params for, so every calling page/component renders a hidden
 * `<input type="hidden" name="demoSlug" value={demoSlug} />` field inside
 * that form (same convention already used for skuId/id/bundleId/tierId/
 * userId etc. across this whole file's callers) -- this is the one, single
 * mechanism used consistently by all 22 actions below (not just "each
 * family," see the story's "be consistent within a family" requirement --
 * one mechanism app-wide is the strictest reading of that). Throws a clear
 * error rather than silently falling back to a default demo when the field
 * is missing or not a known slug -- a caller-facing bug here should be loud,
 * never a silent cross-demo bleed.
 */
function requireDemoSlug(formData: FormData): DemoSlug {
  const raw = String(formData.get("demoSlug") ?? "");
  if (!isDemoSlug(raw)) {
    throw new Error(`Missing or invalid "demoSlug" in form submission: ${JSON.stringify(raw)}`);
  }
  return raw;
}

/**
 * demo-routing-04: this app has no existing "what is my own public origin"
 * helper anywhere (confirmed by grepping the whole app for headers()/
 * x-forwarded-host/NEXT_PUBLIC_*URL usage -- there is none), so
 * startCheckoutAction below introduces the simplest fix rather than a new
 * headers()-based pattern nothing else in this app uses: an env var with a
 * sensible localhost fallback, matching every other optional-adapter env
 * var in lib/services.ts's own "env var truthy picks the real thing, else a
 * harmless local default" shape. Not NEXT_PUBLIC_-prefixed -- this is only
 * ever read from a "use server" action, never shipped to the client bundle.
 */
function resolveAppOrigin(): string {
  return process.env.APP_ORIGIN ?? "http://localhost:3000";
}

/**
 * admin-auth-03: the guard every admin mutation action below calls as the
 * literal first line of its body. Reads the current session via the wired
 * adminAuth service (Clerk when configured, the dev default otherwise --
 * see lib/services.ts), then checks hasPermission(role, action) --
 * throwing a clear error when there is no session at all, or when the
 * session's role lacks the requested permission. Every one of the 12
 * mutation actions listed in admin-auth-03-route-and-mutation-gating.yaml
 * calls this with action="mutate"; updateAdminUserRoleAction (story 04)
 * will call it with action="manage_users" instead.
 *
 * demo-routing-04: now takes the caller's already-parsed demoSlug (each
 * admin action below calls requireDemoSlug(formData) first, then passes the
 * result here) rather than a hardcoded "print-shop" -- a print-shop
 * admin session has no business gating a northline mutation against
 * print-shop's adminAuth adapter, or vice versa.
 */
async function requireAdminPermission(demoSlug: DemoSlug, action: AdminAction): Promise<void> {
  const { adminAuth } = await getServicesForDemo(demoSlug);
  const session = await adminAuth.getCurrentSession();
  if (!session || !hasPermission(session.role, action)) {
    throw new Error(`Not authorized: this action requires "${action}" permission.`);
  }
}

/**
 * print-shop-02: reads the PDP's optional `customizationNote` text input
 * (only rendered for a product flagged customizable -- see lib/seed.ts's
 * isCustomizableProduct and components/pdp-tabbed-detail.tsx /
 * components/pdp-long-scroll.tsx) and passes it straight through to
 * cart.addItem's new optional 4th param (design-discussion.md §1b).
 * Genuinely additive: a non-customizable product's PDP never renders that
 * field at all, so `formData.get("customizationNote")` is simply null for
 * it and this resolves to `undefined`, byte-identical to this action's
 * pre-personalization behavior.
 */
export async function addToCartAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const skuId = String(formData.get("skuId"));
  const quantity = Number(formData.get("quantity") ?? 1);
  const customizationNoteRaw = formData.get("customizationNote");
  const customizationNote =
    typeof customizationNoteRaw === "string" && customizationNoteRaw.trim().length > 0
      ? customizationNoteRaw.trim()
      : undefined;
  const cartId = await getOrCreateCartId(demoSlug);
  const { cart } = await getServicesForDemo(demoSlug);
  await cart.addItem(cartId, skuId, quantity, customizationNote);
  revalidatePath(`/demo/${demoSlug}/cart`);
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
  const demoSlug = requireDemoSlug(formData);
  const bundleId = String(formData.get("bundleId"));
  const tierId = String(formData.get("tierId"));
  const cartId = await getOrCreateCartId(demoSlug);
  const { bundles, cart } = await getServicesForDemo(demoSlug);

  const bundle = await bundles.getBundle(bundleId);
  const tier = bundle?.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`No such bundle tier: ${bundleId}/${tierId}`);

  for (const skuId of tier.skuIds) {
    await cart.addItem(cartId, skuId, 1);
  }
  revalidatePath(`/demo/${demoSlug}/cart`);
}

/**
 * design-system-v2-02: packages/cart's updateQuantity/removeItem were
 * already real, tested CartService methods (see packages/cart/src/
 * service.ts) with no app-layer server action wired to them yet -- the
 * cart page only ever exposed addToCartAction (from the PDP), applyCoupon,
 * and startCheckout. This story's 3 new cart templates need real
 * quantity-update/remove-line controls (per its acceptance criteria), so
 * these two actions expose the existing service methods following the
 * exact same convention as every other action in this file (requireDemoSlug
 * first, then a single service call, then revalidatePath). quantity <= 0 is
 * intentionally allowed through to updateQuantity() itself, which already
 * treats that as "remove the line" (see that method's own doc comment) --
 * no extra validation duplicated here.
 */
export async function updateCartItemQuantityAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const skuId = String(formData.get("skuId"));
  const quantity = Number(formData.get("quantity") ?? 1);
  const cartId = await readCartId(demoSlug);
  if (!cartId) throw new Error("Cannot update quantity -- no cart exists yet.");
  const { cart } = await getServicesForDemo(demoSlug);
  await cart.updateQuantity(cartId, skuId, quantity);
  revalidatePath(`/demo/${demoSlug}/cart`);
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const skuId = String(formData.get("skuId"));
  const cartId = await readCartId(demoSlug);
  if (!cartId) throw new Error("Cannot remove item -- no cart exists yet.");
  const { cart } = await getServicesForDemo(demoSlug);
  await cart.removeItem(cartId, skuId);
  revalidatePath(`/demo/${demoSlug}/cart`);
}

export async function applyCouponAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const code = String(formData.get("code") ?? "").trim();
  await setCouponCode(demoSlug, code);
  revalidatePath(`/demo/${demoSlug}/cart`);
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const cartId = await readCartId(demoSlug);
  if (!cartId) throw new Error("Cannot check out -- no cart exists yet.");

  const customerId = await getOrCreateCustomerId(demoSlug);
  const couponCode = await readCouponCode(demoSlug);
  const { checkout } = await getServicesForDemo(demoSlug);
  // Stripe requires an absolute successUrl/cancelUrl, not a relative path --
  // resolveAppOrigin() (see this file's top) is this app's own "public
  // origin" resolution, reused here rather than re-hardcoding localhost.
  const origin = resolveAppOrigin();
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
    successUrl: `${origin}/demo/${demoSlug}/order/confirmed`,
    cancelUrl: `${origin}/demo/${demoSlug}/cart`,
  });

  redirect(result.redirectUrl);
}

/**
 * The dev-default admin sign-in flow -- the piece that was missing entirely
 * before this fix. app/demo/[demoSlug]/admin/layout.tsx redirects an
 * unauthenticated visit to /sign-in, but until now nothing ever SET the
 * ADMIN_DEV_SESSION_COOKIE that packages/admin-auth's default adapter reads
 * -- every prior epic's live-verification that "authenticated as dev-owner"
 * did so by crafting the cookie directly in test code, never through a real
 * page. Only meaningful when CLERK_SECRET_KEY is unset (the dev-default
 * path); when Clerk is configured, middleware.ts's auth.protect() redirects
 * to Clerk's own hosted sign-in before this page is ever reached at all.
 * Per default-adapter.ts's own documented design, the cookie's value IS the
 * password itself, verified via verifyDevPassword() on every read -- this
 * action doesn't change that model, only supplies the missing UI to set it.
 */
export async function signInDevAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const redirectUrl = String(formData.get("redirect_url") ?? "/");

  if (!verifyDevPassword(password)) {
    redirect(`/sign-in?error=1&redirect_url=${encodeURIComponent(redirectUrl)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_DEV_SESSION_COOKIE, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours -- a real session-length default, not indefinite.
  });

  redirect(redirectUrl);
}

export async function setThemeAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const theme = String(formData.get("theme"));
  const cookieStore = await cookies();
  cookieStore.set(themeCookieName(demoSlug), theme, { sameSite: "lax", path: "/" });
  // demo-routing-05: app/demo/[demoSlug]/layout.tsx (the layout that
  // actually renders <ThemeSwitcher/> and reads the theme cookie) now
  // exists and is scoped to exactly this path, so this revalidates that
  // demo's own layout only -- it never touches the other demo's layout or
  // the demo-agnostic landing page's layout (app/(landing)/layout.tsx),
  // which don't read this cookie at all.
  revalidatePath(`/demo/${demoSlug}`, "layout");
}

/**
 * sandbox-checkout epic: the landing page's theme gallery reuses this
 * instead of setThemeAction above -- setThemeAction stays on whatever page
 * it was submitted from (theme-switcher.tsx auto-submits from inside a demo
 * page and expects to stay there), while a "preview this theme" link on the
 * demo-agnostic landing page needs to both set the cookie AND actually
 * navigate into that demo. Same cookie write as setThemeAction, plus a
 * redirect; kept as a separate action rather than an optional param on
 * setThemeAction so neither caller has to reason about a conditional
 * redirect.
 */
export async function applyThemeAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const theme = String(formData.get("theme"));
  const cookieStore = await cookies();
  cookieStore.set(themeCookieName(demoSlug), theme, { sameSite: "lax", path: "/" });
  redirect(`/demo/${demoSlug}`);
}

/**
 * sandbox-checkout epic: the server action `/demo/[demoSlug]/checkout/
 * sandbox`'s own "Pay" form submits to -- the sandbox-mode equivalent of a
 * verified Stripe webhook completing a real payment (see
 * packages/payments/src/sandbox-adapter.ts's doc comment). `successUrl` is
 * round-tripped through that page's own URL query string (originally built
 * by resolveAppOrigin() + `/demo/${demoSlug}/order/confirmed` in
 * startCheckoutAction above), which a shopper's browser could in principle
 * tamper with before this action runs -- checked against resolveAppOrigin()
 * before redirecting so this can never become an open redirect to an
 * arbitrary external host.
 */
export async function confirmSandboxCheckoutAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  const sessionId = String(formData.get("session") ?? "");
  const successUrl = String(formData.get("successUrl") ?? "");
  if (!sessionId) throw new Error("Missing sandbox checkout session id.");
  if (!successUrl.startsWith(resolveAppOrigin())) {
    throw new Error("Refusing to redirect to an untrusted successUrl.");
  }

  const { confirmSandboxPayment } = await getServicesForDemo(demoSlug);
  if (!confirmSandboxPayment) {
    throw new Error(
      "Sandbox checkout is not active for this deployment -- a real STRIPE_SECRET_KEY is configured, so " +
        "checkout should have gone through real Stripe Checkout instead of this page.",
    );
  }

  await confirmSandboxPayment(sessionId);
  redirect(successUrl);
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
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const { promotions } = await getServicesForDemo(demoSlug);
  await promotions.createPromotion(parsePromotionFormData(formData));
  revalidatePath(`/demo/${demoSlug}/admin/promotions`);
  redirect(`/demo/${demoSlug}/admin/promotions`);
}

export async function updatePromotionAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { promotions } = await getServicesForDemo(demoSlug);
  const updated = await promotions.updatePromotion(id, parsePromotionFormData(formData));
  if (!updated) throw new Error(`No such promotion: ${id}`);
  revalidatePath(`/demo/${demoSlug}/admin/promotions`);
  redirect(`/demo/${demoSlug}/admin/promotions`);
}

export async function deactivatePromotionAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { promotions } = await getServicesForDemo(demoSlug);
  await promotions.deactivatePromotion(id);
  revalidatePath(`/demo/${demoSlug}/admin/promotions`);
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
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const { bundles } = await getServicesForDemo(demoSlug);
  await bundles.createBundle(parseBundleFormData(formData));
  revalidatePath(`/demo/${demoSlug}/admin/bundles`);
  redirect(`/demo/${demoSlug}/admin/bundles`);
}

export async function updateBundleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { bundles } = await getServicesForDemo(demoSlug);
  const updated = await bundles.updateBundle(id, parseBundleFormData(formData));
  if (!updated) throw new Error(`No such bundle: ${id}`);
  revalidatePath(`/demo/${demoSlug}/admin/bundles`);
  redirect(`/demo/${demoSlug}/admin/bundles`);
}

export async function deactivateBundleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { bundles } = await getServicesForDemo(demoSlug);
  await bundles.deactivateBundle(id);
  revalidatePath(`/demo/${demoSlug}/admin/bundles`);
}

/**
 * Parses the recommendations admin form fields shared by create and update.
 * targetProductIds is a single comma-or-newline-separated textarea, same
 * splitting convention as a bundle tier's skuIds field (see
 * parseBundleFormData above).
 */
function parseRecommendationRuleFormData(formData: FormData): CreateRuleInput {
  const targetProductIds = String(formData.get("targetProductIds") ?? "")
    .split(/[,\n]/)
    .map((productId) => productId.trim())
    .filter((productId) => productId.length > 0);

  const placement = formData.get("placement");
  const status = String(formData.get("status") ?? "active");

  return {
    sourceProductId: String(formData.get("sourceProductId") ?? "").trim(),
    label: String(formData.get("label") ?? "").trim(),
    placement: placement === "pdp" || placement === "cart" ? placement : "both",
    targetProductIds,
    status: status === "inactive" ? "inactive" : "active",
  };
}

export async function createRecommendationRuleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const { recommendations } = await getServicesForDemo(demoSlug);
  await recommendations.createRule(parseRecommendationRuleFormData(formData));
  revalidatePath(`/demo/${demoSlug}/admin/recommendations`);
  redirect(`/demo/${demoSlug}/admin/recommendations`);
}

export async function updateRecommendationRuleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { recommendations } = await getServicesForDemo(demoSlug);
  const updated = await recommendations.updateRule(id, parseRecommendationRuleFormData(formData));
  if (!updated) throw new Error(`No such recommendation rule: ${id}`);
  revalidatePath(`/demo/${demoSlug}/admin/recommendations`);
  redirect(`/demo/${demoSlug}/admin/recommendations`);
}

export async function deactivateRecommendationRuleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { recommendations } = await getServicesForDemo(demoSlug);
  await recommendations.deactivateRule(id);
  revalidatePath(`/demo/${demoSlug}/admin/recommendations`);
}

/** Matches CampaignFormFields' fixed number of creative slots. */
const CAMPAIGN_CREATIVE_SLOTS = 5;

/**
 * Parses the advertising admin form's fixed, indexed creative slots
 * (creative_0_headline/creative_0_body/creative_0_imageUrl/
 * creative_0_linkHref/creative_0_weight/creative_0_id, creative_1_..., ...)
 * shared by create and update -- mirrors parseBundleFormData's tier-slot
 * convention. A slot with a blank headline, body, AND linkHref is treated as
 * unused and omitted from the result. Each included creative keeps its
 * existing id (from the hidden creative_N_id field, edit forms only) or gets
 * a freshly generated one (create forms, or a genuinely new slot on an
 * edit) -- creative ids are caller-supplied per the advertising package's
 * CreateCampaignInput.
 */
function parseCampaignFormData(formData: FormData): CreateCampaignInput {
  const creatives: Array<Omit<Creative, "weight"> & { weight?: number }> = [];
  for (let i = 0; i < CAMPAIGN_CREATIVE_SLOTS; i++) {
    const headline = String(formData.get(`creative_${i}_headline`) ?? "").trim();
    const body = String(formData.get(`creative_${i}_body`) ?? "").trim();
    const linkHref = String(formData.get(`creative_${i}_linkHref`) ?? "").trim();
    if (headline.length === 0 && body.length === 0 && linkHref.length === 0) continue;

    const imageUrl = String(formData.get(`creative_${i}_imageUrl`) ?? "").trim();
    const weight = String(formData.get(`creative_${i}_weight`) ?? "").trim();
    const existingId = String(formData.get(`creative_${i}_id`) ?? "").trim();

    creatives.push({
      id: existingId.length > 0 ? existingId : randomUUID(),
      headline,
      body,
      imageUrl: imageUrl.length > 0 ? imageUrl : null,
      linkHref,
      weight: weight.length > 0 ? Number(weight) : undefined,
    });
  }

  const serviceAreaId = String(formData.get("serviceAreaId") ?? "").trim();
  const pageSlug = String(formData.get("pageSlug") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim();
  const endsAt = String(formData.get("endsAt") ?? "").trim();
  const status = String(formData.get("status") ?? "active");

  return {
    name: String(formData.get("name") ?? "").trim(),
    startsAt: startsAt.length > 0 ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt.length > 0 ? new Date(endsAt).toISOString() : null,
    targeting: {
      serviceAreaId: serviceAreaId.length > 0 ? serviceAreaId : null,
      pageSlug: pageSlug.length > 0 ? pageSlug : null,
    },
    creatives,
    status: status === "inactive" ? "inactive" : "active",
  };
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const { advertising } = await getServicesForDemo(demoSlug);
  await advertising.createCampaign(parseCampaignFormData(formData));
  revalidatePath(`/demo/${demoSlug}/admin/advertising`);
  redirect(`/demo/${demoSlug}/admin/advertising`);
}

export async function updateCampaignAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { advertising } = await getServicesForDemo(demoSlug);
  const updated = await advertising.updateCampaign(id, parseCampaignFormData(formData));
  if (!updated) throw new Error(`No such campaign: ${id}`);
  revalidatePath(`/demo/${demoSlug}/admin/advertising`);
  redirect(`/demo/${demoSlug}/admin/advertising`);
}

export async function deactivateCampaignAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const id = String(formData.get("id"));
  const { advertising } = await getServicesForDemo(demoSlug);
  await advertising.deactivateCampaign(id);
  revalidatePath(`/demo/${demoSlug}/admin/advertising`);
}

/** The three AdminRole values a role-change form is allowed to submit. Kept local, mirroring adapter-clerk's own VALID_ROLES convention. */
const VALID_ADMIN_ROLES: readonly AdminRole[] = ["owner", "admin", "viewer"];

/**
 * admin-auth-04: the one admin UI in this epic gated to "owner" only, not
 * "admin or owner" like every other mutation action above -- this is the
 * SECOND of two independent owner-only gates (see app/admin/settings/
 * users/page.tsx's own render-time getCurrentSession() check), so a
 * non-owner session is refused here even if the page-level check were
 * somehow bypassed. Calls requireAdminPermission with action="manage_users"
 * (not "mutate"), which hasPermission only ever grants to "owner" -- see
 * packages/admin-auth/src/permissions.ts.
 */
export async function updateAdminUserRoleAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "manage_users");

  const userId = String(formData.get("userId") ?? "").trim();
  const role = formData.get("role");
  if (!(typeof role === "string" && (VALID_ADMIN_ROLES as readonly string[]).includes(role))) {
    throw new Error(`Invalid role: ${String(role)}`);
  }

  const { adminAuth } = await getServicesForDemo(demoSlug);
  await adminAuth.setAdminUserRole(userId, role as AdminRole);
  revalidatePath(`/demo/${demoSlug}/admin/settings/users`);
}

/** Matches CmsSectionFields' fixed number of section slots. */
const CMS_SECTION_SLOTS = 6;

/** The non-"marketing" PageType values -- marketing pages go through createMarketingPageAction instead (see design-discussion.md §3). */
const CMS_PAGE_TYPES: readonly PageType[] = ["home", "category", "search", "pdp", "location"];

/**
 * Parses the CMS admin forms' fixed, indexed section slots
 * (section_0_componentType/section_0_config, section_1_..., ...) shared by
 * the new-page, new-marketing-page, and edit forms -- mirrors
 * parseBundleFormData's tier-slot convention. A slot with a blank
 * componentType is treated as unused and omitted from the result.
 *
 * ComponentInstance's config is Record<string, unknown> by design (opaque
 * to CMS itself -- see docs/subsystems/05-cms-pages.md), so each slot's
 * config textarea is raw JSON. A slot's JSON parse failure throws a clear,
 * specific error naming that slot (1-indexed, matching the UI's "Section N"
 * label) and its componentType, rather than a generic crash -- this is the
 * one place in this parser where a caller-facing mistake must be
 * distinguishable from every other slot's mistake.
 */
function parseCmsSectionFormData(formData: FormData): ComponentInstance[] {
  const sections: ComponentInstance[] = [];
  for (let i = 0; i < CMS_SECTION_SLOTS; i++) {
    const componentType = String(formData.get(`section_${i}_componentType`) ?? "").trim();
    if (componentType.length === 0) continue;

    const configRaw = String(formData.get(`section_${i}_config`) ?? "").trim();
    let config: Record<string, unknown> = {};
    if (configRaw.length > 0) {
      try {
        config = JSON.parse(configRaw) as Record<string, unknown>;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Section ${i + 1} (${componentType}): invalid JSON config -- ${reason}`);
      }
    }
    sections.push({ componentType, config });
  }
  return sections;
}

function parseCmsPageType(formData: FormData): PageType {
  const pageType = formData.get("pageType");
  if (typeof pageType === "string" && (CMS_PAGE_TYPES as readonly string[]).includes(pageType)) {
    return pageType as PageType;
  }
  throw new Error(`Invalid page type: ${String(pageType)}`);
}

export async function createCmsPageAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");

  const pageType = parseCmsPageType(formData);
  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sections = parseCmsSectionFormData(formData);

  const { cms } = await getServicesForDemo(demoSlug);
  await cms.createPage({ pageType, slug, title, sections });
  revalidatePath(`/demo/${demoSlug}/admin/cms`);
  redirect(`/demo/${demoSlug}/admin/cms`);
}

export async function createMarketingPageAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");

  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const campaignName = String(formData.get("campaignName") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const productIds = String(formData.get("productIds") ?? "")
    .split(",")
    .map((productId) => productId.trim())
    .filter((productId) => productId.length > 0);
  const sections = parseCmsSectionFormData(formData);

  const { cms } = await getServicesForDemo(demoSlug);
  await cms.createMarketingPage({
    slug,
    title,
    sections,
    campaignName,
    startDate,
    endDate: endDate.length > 0 ? endDate : null,
    productIds,
  });
  revalidatePath(`/demo/${demoSlug}/admin/cms`);
  redirect(`/demo/${demoSlug}/admin/cms`);
}

/** pageType and slug are intentionally not accepted here -- CmsService.updatePage's own type signature only accepts a title/sections patch (see packages/cms/src/service.ts). */
export async function updateCmsPageAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sections = parseCmsSectionFormData(formData);

  const { cms } = await getServicesForDemo(demoSlug);
  await cms.updatePage(id, { title, sections });
  revalidatePath(`/demo/${demoSlug}/admin/cms`);
  redirect(`/demo/${demoSlug}/admin/cms`);
}

export async function publishCmsPageAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");

  const id = String(formData.get("id") ?? "").trim();

  const { cms } = await getServicesForDemo(demoSlug);
  await cms.publishPage(id);
  revalidatePath(`/demo/${demoSlug}/admin/cms`);
}

/**
 * fulfillment-02: routes and submits a whole order's lines to their
 * configured fulfillment provider (defaulting to "manual" -- see
 * @mercatus-liber/fulfillment's FulfillmentRoutingRepository), via
 * FulfillmentService.submitOrder (packages/fulfillment/src/service.ts).
 * Guarded like every other admin mutation.
 *
 * The manual adapter's submitOrder has no dedup logic of its own -- it
 * blindly appends a fresh FulfillmentLineRecord per line on every call (see
 * manual-adapter.ts) -- so this action checks listForOrder first and is a
 * no-op when this order already has at least one record, rather than
 * risking duplicate records from a double form submission or a repeat
 * click on the extended orders admin page.
 */
export async function submitOrderForFulfillmentAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const orderId = String(formData.get("orderId") ?? "").trim();

  const { fulfillment } = await getServicesForDemo(demoSlug);
  const existing = await fulfillment.listForOrder(orderId);
  if (existing.length === 0) {
    await fulfillment.submitOrder(orderId);
  }
  revalidatePath(`/demo/${demoSlug}/admin/orders`);
}

/**
 * fulfillment-02: the operator-driven "mark shipped by hand" action for one
 * order line -- delegates to FulfillmentService.markLineShipped, which
 * itself delegates to the line's routed provider's adapter (only the manual
 * adapter supports this today; a future webhook-driven provider updates
 * status via handleWebhookEvent instead of this action -- see service.ts's
 * ManualStatusUpdateNotSupportedError). trackingNumber/trackingUrl are both
 * optional free-text fields, same blank-input-means-omit convention as
 * every other optional text field parsed in this file (e.g.
 * parsePromotionFormData's minCartAmount above). Guarded like every other
 * admin mutation.
 */
export async function markFulfillmentLineShippedAction(formData: FormData): Promise<void> {
  const demoSlug = requireDemoSlug(formData);
  await requireAdminPermission(demoSlug, "mutate");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const skuId = String(formData.get("skuId") ?? "").trim();
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  const trackingUrl = String(formData.get("trackingUrl") ?? "").trim();

  const { fulfillment } = await getServicesForDemo(demoSlug);
  await fulfillment.markLineShipped(orderId, skuId, {
    trackingNumber: trackingNumber.length > 0 ? trackingNumber : undefined,
    trackingUrl: trackingUrl.length > 0 ? trackingUrl : undefined,
  });
  revalidatePath(`/demo/${demoSlug}/admin/orders`);
}
