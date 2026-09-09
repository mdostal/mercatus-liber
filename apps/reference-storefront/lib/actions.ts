"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasPermission, type AdminAction, type AdminRole } from "@mercatus-liber/admin-auth";
import type { BundleTier, CreateBundleInput } from "@mercatus-liber/bundles";
import type { CreateCampaignInput, Creative } from "@mercatus-liber/advertising";
import type { ComponentInstance, PageType } from "@mercatus-liber/cms";
import type { CreatePromotionInput } from "@mercatus-liber/promotions";
import type { CreateRuleInput } from "@mercatus-liber/recommendations";
import { getOrCreateCartId, readCartId } from "./cart-cookie";
import { readCouponCode, setCouponCode } from "./coupon-cookie";
import { getOrCreateCustomerId } from "./customer-cookie";
import { getServices } from "./services";
import { THEME_COOKIE } from "./theme-cookie";

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
 */
async function requireAdminPermission(action: AdminAction): Promise<void> {
  const { adminAuth } = await getServices();
  const session = await adminAuth.getCurrentSession();
  if (!session || !hasPermission(session.role, action)) {
    throw new Error(`Not authorized: this action requires "${action}" permission.`);
  }
}

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
  await requireAdminPermission("mutate");
  const { promotions } = await getServices();
  await promotions.createPromotion(parsePromotionFormData(formData));
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions");
}

export async function updatePromotionAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { promotions } = await getServices();
  const updated = await promotions.updatePromotion(id, parsePromotionFormData(formData));
  if (!updated) throw new Error(`No such promotion: ${id}`);
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions");
}

export async function deactivatePromotionAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
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
  await requireAdminPermission("mutate");
  const { bundles } = await getServices();
  await bundles.createBundle(parseBundleFormData(formData));
  revalidatePath("/admin/bundles");
  redirect("/admin/bundles");
}

export async function updateBundleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { bundles } = await getServices();
  const updated = await bundles.updateBundle(id, parseBundleFormData(formData));
  if (!updated) throw new Error(`No such bundle: ${id}`);
  revalidatePath("/admin/bundles");
  redirect("/admin/bundles");
}

export async function deactivateBundleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { bundles } = await getServices();
  await bundles.deactivateBundle(id);
  revalidatePath("/admin/bundles");
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
  await requireAdminPermission("mutate");
  const { recommendations } = await getServices();
  await recommendations.createRule(parseRecommendationRuleFormData(formData));
  revalidatePath("/admin/recommendations");
  redirect("/admin/recommendations");
}

export async function updateRecommendationRuleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { recommendations } = await getServices();
  const updated = await recommendations.updateRule(id, parseRecommendationRuleFormData(formData));
  if (!updated) throw new Error(`No such recommendation rule: ${id}`);
  revalidatePath("/admin/recommendations");
  redirect("/admin/recommendations");
}

export async function deactivateRecommendationRuleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { recommendations } = await getServices();
  await recommendations.deactivateRule(id);
  revalidatePath("/admin/recommendations");
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
  await requireAdminPermission("mutate");
  const { advertising } = await getServices();
  await advertising.createCampaign(parseCampaignFormData(formData));
  revalidatePath("/admin/advertising");
  redirect("/admin/advertising");
}

export async function updateCampaignAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { advertising } = await getServices();
  const updated = await advertising.updateCampaign(id, parseCampaignFormData(formData));
  if (!updated) throw new Error(`No such campaign: ${id}`);
  revalidatePath("/admin/advertising");
  redirect("/admin/advertising");
}

export async function deactivateCampaignAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");
  const id = String(formData.get("id"));
  const { advertising } = await getServices();
  await advertising.deactivateCampaign(id);
  revalidatePath("/admin/advertising");
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
  await requireAdminPermission("manage_users");

  const userId = String(formData.get("userId") ?? "").trim();
  const role = formData.get("role");
  if (!(typeof role === "string" && (VALID_ADMIN_ROLES as readonly string[]).includes(role))) {
    throw new Error(`Invalid role: ${String(role)}`);
  }

  const { adminAuth } = await getServices();
  await adminAuth.setAdminUserRole(userId, role as AdminRole);
  revalidatePath("/admin/settings/users");
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
  await requireAdminPermission("mutate");

  const pageType = parseCmsPageType(formData);
  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sections = parseCmsSectionFormData(formData);

  const { cms } = await getServices();
  await cms.createPage({ pageType, slug, title, sections });
  revalidatePath("/admin/cms");
  redirect("/admin/cms");
}

export async function createMarketingPageAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");

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

  const { cms } = await getServices();
  await cms.createMarketingPage({
    slug,
    title,
    sections,
    campaignName,
    startDate,
    endDate: endDate.length > 0 ? endDate : null,
    productIds,
  });
  revalidatePath("/admin/cms");
  redirect("/admin/cms");
}

/** pageType and slug are intentionally not accepted here -- CmsService.updatePage's own type signature only accepts a title/sections patch (see packages/cms/src/service.ts). */
export async function updateCmsPageAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sections = parseCmsSectionFormData(formData);

  const { cms } = await getServices();
  await cms.updatePage(id, { title, sections });
  revalidatePath("/admin/cms");
  redirect("/admin/cms");
}

export async function publishCmsPageAction(formData: FormData): Promise<void> {
  await requireAdminPermission("mutate");

  const id = String(formData.get("id") ?? "").trim();

  const { cms } = await getServices();
  await cms.publishPage(id);
  revalidatePath("/admin/cms");
}
