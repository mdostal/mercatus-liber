"use server";

/** Admin actions for lines (sales catalogs). Every action checks the admin session first, like lib/actions.ts. */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasPermission } from "@mercatus-liber/admin-auth";
import type { CatalogSection } from "@mercatus-liber/catalog";
import { DEMO_CATALOG_SLUG, isDemoSlug, type DemoSlug } from "./demos";
import { parseSectionsText } from "./lines";
import { getServicesForDemo } from "./services";
import { zonedLocalToUtc } from "./store-time";

async function admin(formData: FormData) {
  const demoSlug = String(formData.get("demoSlug") ?? "");
  if (!isDemoSlug(demoSlug)) throw new Error(`Unknown demo "${demoSlug}".`);
  const services = await getServicesForDemo(demoSlug);
  const session = await services.adminAuth.getCurrentSession();
  if (!session || !hasPermission(session.role, "mutate")) throw new Error('Not authorized: this action requires "mutate" permission.');
  return { demoSlug: demoSlug as DemoSlug, services };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/** The form's fields as catalog input. Product slugs in sections become ids; unknown ones are refused. */
async function lineInput(formData: FormData, services: Awaited<ReturnType<typeof getServicesForDemo>>) {
  const sections: CatalogSection[] = [];
  for (const section of parseSectionsText(text(formData, "sections"))) {
    const productIds: string[] = [];
    for (const slug of section.productSlugs) {
      const product = await services.catalog.getProductBySlug(slug);
      if (!product) throw new Error(`No product "${slug}" (in section "${section.slug}").`);
      productIds.push(product.id);
    }
    sections.push({ slug: section.slug, title: section.title, productIds });
  }
  const heroTitle = text(formData, "heroTitle");
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    status: (text(formData, "status") || "active") as "draft" | "active",
    activeFrom: zonedLocalToUtc(text(formData, "activeFrom")),
    activeTo: zonedLocalToUtc(text(formData, "activeTo")),
    ...(heroTitle ? { hero: { title: heroTitle, ...(text(formData, "heroSubtitle") ? { subtitle: text(formData, "heroSubtitle") } : {}), ...(text(formData, "heroImage") ? { imageUrl: text(formData, "heroImage") } : {}) } } : {}),
    sections,
  };
}

export async function createLineAction(formData: FormData): Promise<void> {
  const { demoSlug, services } = await admin(formData);
  const master = await services.catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
  if (!master) throw new Error("This demo has no catalog.");
  const slug = text(formData, "slug");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("The slug may use only lowercase letters, digits and \"-\".");
  const line = await services.catalog.createCatalog({ slug, kind: "sales", masterCatalogId: master.id, ...(await lineInput(formData, services)) });
  revalidatePath(`/demo/${demoSlug}/admin/lines`);
  redirect(`/demo/${demoSlug}/admin/lines/${line.id}`);
}

export async function updateLineAction(formData: FormData): Promise<void> {
  const { demoSlug, services } = await admin(formData);
  const id = text(formData, "id");
  await services.catalog.updateCatalog(id, await lineInput(formData, services));
  revalidatePath(`/demo/${demoSlug}/admin/lines`, "layout");
  revalidatePath(`/demo/${demoSlug}/lines`, "layout");
}

/** Gives the line's products a window covering every line they're in. */
export async function applyLineWindowAction(formData: FormData): Promise<void> {
  const { demoSlug, services } = await admin(formData);
  await services.catalog.applyCatalogWindowToProducts(text(formData, "id"));
  revalidatePath(`/demo/${demoSlug}/admin/lines`, "layout");
}
