"use server";

/**
 * Admin actions for the Printful catalog pages: work out a product's costs,
 * bring it into this demo's store, publish it once it's ready, and set its
 * art. Every action checks the admin session first, like lib/actions.ts.
 */
import { revalidatePath } from "next/cache";
import { hasPermission } from "@mercatus-liber/admin-auth";
import {
  PrintfulApiError,
  printfulMockupImages,
  printfulMockupRequest,
  PrintfulRateLimitError,
  PrintfulProductNotReadyError,
  publishPrintfulProduct,
  setPrintfulArt,
} from "@mercatus-liber/adapter-printful";
import type { BringOverPlanResult, BringOverResult, BringOverSelection, MockupImage, MockupPollResult, MockupRequestResult, MockupSaveResult } from "@mercatus-liber/admin-ui";
import { copyImageToMediaStore } from "@mercatus-liber/media";
import { isDemoSlug, type DemoSlug } from "./demos";
import { bringOverPrintful, planPrintfulBringOver } from "./printful-admin";
import { getServicesForDemo, type Services } from "./services";

async function adminServices(demoSlug: string): Promise<{ slug: DemoSlug; services: Services }> {
  if (!isDemoSlug(demoSlug)) throw new Error(`Unknown demo "${demoSlug}".`);
  const services = await getServicesForDemo(demoSlug);
  const session = await services.adminAuth.getCurrentSession();
  if (!session || !hasPermission(session.role, "mutate")) throw new Error('Not authorized: this action requires "mutate" permission.');
  return { slug: demoSlug, services };
}

export async function planPrintfulBringOverAction(demoSlug: string, printfulProductId: number, selection: BringOverSelection): Promise<BringOverPlanResult> {
  try {
    const { services } = await adminServices(demoSlug);
    const plan = await planPrintfulBringOver(services, printfulProductId, selection);
    return {
      ok: true,
      rows: plan.skus.map((s) => ({ color: s.color, size: s.size, priceCents: s.price.amount, costCents: s.costCents, marginCents: s.marginCents })),
      unavailable: plan.unavailable,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function bringOverPrintfulAction(demoSlug: string, printfulProductId: number, selection: BringOverSelection): Promise<BringOverResult> {
  try {
    const { slug, services } = await adminServices(demoSlug);
    const result = await bringOverPrintful(services, slug, printfulProductId, selection);
    revalidatePath(`/demo/${slug}/admin/printful`, "layout");
    return {
      ok: true,
      message: `Brought over "${selection.title}" with ${result.skuCount} SKU${result.skuCount === 1 ? "" : "s"}${result.drafts ? " as drafts; add art before it can sell" : ""}. It stays unpublished until you publish it.`,
      href: `/demo/${slug}/admin/printful/${printfulProductId}#in-store`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Form action: publishes a Printful product when it's ready. */
export async function publishPrintfulProductAction(formData: FormData): Promise<void> {
  const demoSlug = String(formData.get("demoSlug") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const printfulProductId = String(formData.get("printfulProductId") ?? "");
  const { slug, services } = await adminServices(demoSlug);
  const client = services.printfulCatalog;
  try {
    await publishPrintfulProduct({ catalog: services.catalog, mappings: services.providerCatalogMappings, ...(client ? { prices: (id: number) => client.getPrices(id) } : {}) }, productId);
  } catch (err) {
    if (err instanceof PrintfulProductNotReadyError) throw new Error(err.message);
    throw err;
  }
  revalidatePath(`/demo/${slug}/admin/printful/${printfulProductId}`);
}

/** Sets the art for one placement on every SKU of a store product made from Printful. */
export async function setPrintfulArtAction(demoSlug: string, productId: string, file: { placement: string; technique: string; url: string } | { remove: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { slug, services } = await adminServices(demoSlug);
    const deps = { catalog: services.catalog, mappings: services.providerCatalogMappings };
    if ("remove" in file) await setPrintfulArt(deps, productId, [], { remove: [file.remove] });
    else {
      if (!/^https:\/\//.test(file.url)) throw new Error("Art must be a public https URL Printful can download.");
      await setPrintfulArt(deps, productId, [file]);
    }
    revalidatePath(`/demo/${slug}/admin/printful`, "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Bound per placement by the placement page: (demoSlug, productId, placement, technique) then the URL. */
export async function savePrintfulArtAction(demoSlug: string, productId: string, placement: string, technique: string, url: string) {
  return setPrintfulArtAction(demoSlug, productId, { placement, technique, url });
}

/** Bound per placement by the placement page. */
export async function removePrintfulArtAction(demoSlug: string, productId: string, placement: string) {
  return setPrintfulArtAction(demoSlug, productId, { remove: placement });
}

/** The product's SKUs as `{ printful variant id -> "Black / M" }`, from their mappings. */
async function variantLabels(services: Services, productId: string): Promise<Map<number, { skuId: string; label: string }>> {
  const labels = new Map<number, { skuId: string; label: string }>();
  for (const sku of await services.catalog.listSkusByProduct(productId)) {
    const target = (await services.providerCatalogMappings.get(sku.id, "printful"))?.target as { catalogVariantId?: number } | undefined;
    if (typeof target?.catalogVariantId === "number") labels.set(target.catalogVariantId, { skuId: sku.id, label: sku.identifyingAttributes.map((a) => String(a.value)).join(" / ") });
  }
  return labels;
}

/** Starts a Printful mockup task for some of a product's variants, with the product's current print files. */
export async function requestPrintfulMockupsAction(demoSlug: string, productId: string, variantIds: string[]): Promise<MockupRequestResult> {
  try {
    const { services } = await adminServices(demoSlug);
    const client = services.printfulCatalog;
    if (!client) throw new Error("Mockups need PRINTFUL_API_TOKEN.");
    const labels = await variantLabels(services, productId);
    const skuIds = variantIds.map((id) => labels.get(Number(id))?.skuId).filter((id): id is string => Boolean(id));
    if (skuIds.length === 0) throw new Error("Choose at least one of this product's colours.");
    const request = await printfulMockupRequest({ mappings: services.providerCatalogMappings }, skuIds);
    const [task] = await client.createMockupTasks(request);
    if (!task) throw new Error("Printful didn't start a mockup task.");
    return { ok: true, taskId: String(task.id) };
  } catch (err) {
    if (err instanceof PrintfulRateLimitError) return { ok: false, error: "Printful allows only a few mockup requests a minute.", ...(err.retryAfterSeconds !== null ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
    if (err instanceof PrintfulApiError && JSON.stringify(err.body).includes("store_id")) return { ok: false, error: "Printful needs PRINTFUL_STORE_ID for mockups with an account-level token." };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function printfulMockupStatusAction(demoSlug: string, productId: string, taskId: string): Promise<MockupPollResult> {
  try {
    const { services } = await adminServices(demoSlug);
    const client = services.printfulCatalog;
    if (!client || !/^\d+$/.test(taskId)) throw new Error("No such mockup task.");
    const tasks = await client.getMockupTasks([Number(taskId)]);
    const task = tasks[0];
    if (!task) throw new Error("No such mockup task.");
    if (task.status === "pending") return { status: "pending" };
    if (task.status === "failed") return { status: "failed", error: `Printful couldn't make the mockups: ${JSON.stringify(task.failure_reasons ?? []).slice(0, 300)}` };
    const labels = await variantLabels(services, productId);
    return {
      status: "completed",
      images: printfulMockupImages(tasks).map((img) => ({
        key: `${img.catalogVariantId}-${img.placement}-${img.styleId ?? ""}`,
        url: img.url,
        label: [labels.get(img.catalogVariantId)?.label ?? `Variant ${img.catalogVariantId}`, img.view ?? img.placement].join(", "),
      })),
    };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Printful's mockup hosts. Only these are copied, so the action can't be used to fetch arbitrary URLs. */
const MOCKUP_HOSTS = [/^printful-upload\.s3[\w.-]*\.amazonaws\.com$/, /(^|\.)printful\.com$/];

/** Copies chosen mockups into the store's media (Printful's URLs are temporary) and puts them first in the product's images. */
export async function savePrintfulMockupsAction(demoSlug: string, productId: string, images: MockupImage[]): Promise<MockupSaveResult> {
  try {
    const { slug, services } = await adminServices(demoSlug);
    const product = await services.catalog.getProduct(productId);
    if (!product) throw new Error("No such product.");
    const saved: { url: string; alt: string }[] = [];
    for (const img of images.slice(0, 12)) {
      const host = new URL(img.url).hostname;
      if (!MOCKUP_HOSTS.some((re) => re.test(host))) throw new Error(`Not a Printful mockup: ${img.url}`);
      const file = await copyImageToMediaStore(services.mediaStore, img.url, `${product.slug}-${img.key}.jpg`);
      saved.push({ url: file.url, alt: `${product.title}, ${img.label}` });
    }
    await services.catalog.updateProduct(productId, { images: [...saved, ...(product.images ?? [])] });
    revalidatePath(`/demo/${slug}/admin/printful`, "layout");
    return { ok: true, message: `Saved ${saved.length} image${saved.length === 1 ? "" : "s"} to the product.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
