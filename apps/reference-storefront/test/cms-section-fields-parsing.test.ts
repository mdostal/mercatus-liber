/**
 * scc-03: proves parseCmsSectionFormData (lib/actions.ts) -- the schema-typed
 * replacement for the old whole-slot raw-JSON textarea/JSON.parse -- reads
 * the new named per-field inputs CmsSectionFields.tsx renders
 * (`section_<i>_componentType`, `section_<i>_field_<key>`) and reassembles
 * each slot's ComponentInstance.config into the SAME shape the old raw-JSON
 * editor would have produced for the same logical edit, for every one of
 * scc-02's 5 real component types (hero-banner/ad-slot/category-spot/
 * product-grid/service-area-info) -- see component-registry.ts's fields[].
 *
 * Same test posture as test/admin-mutation-guard.test.ts and
 * test/storefront-views.test.ts: getServicesForDemo is mocked wholesale
 * (an injectable mock AdminAuthAdapter, a real in-memory-backed CmsService
 * underneath so a "succeeds" assertion proves an actual mutation happened),
 * next/cache's revalidatePath and next/navigation's redirect are mocked
 * no-ops (createCmsPageAction/updateCmsPageAction call both on success,
 * outside any real Next.js request context a vitest run has).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter } from "@mercatus-liber/cms";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

let currentSession: AdminSession | null = null;

const cms = createCmsService({ persistence: createInMemoryCmsAdapter(), components: createComponentRegistry() });

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ adminAuth: mockAdminAuth, cms })),
}));

const { createCmsPageAction, updateCmsPageAction } = await import("../lib/actions.js");

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

/** Mirrors CmsSectionFields.tsx's own field input naming (`section_<i>_componentType` / `section_<i>_field_<key>`) -- an array value appends multiple FormData entries under the same name, matching a real `<select multiple>` submission. */
function setSectionSlot(
  formData: FormData,
  slot: number,
  componentType: string,
  fields: Record<string, string | string[]> = {},
): void {
  formData.set(`section_${slot}_componentType`, componentType);
  for (const [key, value] of Object.entries(fields)) {
    const name = `section_${slot}_field_${key}`;
    if (Array.isArray(value)) {
      for (const v of value) formData.append(name, v);
    } else {
      formData.set(name, value);
    }
  }
}

function baseCreateFormData(slug: string, title: string): FormData {
  const formData = new FormData();
  formData.set("demoSlug", "print-shop");
  formData.set("pageType", "category");
  formData.set("slug", slug);
  formData.set("title", title);
  return formData;
}

describe("CMS section field parsing (scc-03)", () => {
  beforeEach(() => {
    currentSession = sessionFor("owner");
  });

  it("rejects a viewer-role session before mutating (requireAdminPermission unchanged)", async () => {
    currentSession = sessionFor("viewer");
    const formData = baseCreateFormData("guard-typed-fields", "Guard Typed Fields");
    setSectionSlot(formData, 0, "hero-banner", { headline: "Should not save" });
    await expect(createCmsPageAction(formData)).rejects.toThrow(/not authorized/i);
    expect(await cms.getPageBySlug("guard-typed-fields")).toBeNull();
  });

  it("hero-banner: reassembles headline + subheadline into {headline, subheadline}, matching the old raw-JSON shape", async () => {
    const formData = baseCreateFormData("typed-hero", "Typed Hero");
    setSectionSlot(formData, 0, "hero-banner", {
      headline: "Save 20% This Week",
      subheadline: "Limited-time storewide discount.",
    });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-hero");
    expect(page?.sections).toEqual([
      { componentType: "hero-banner", config: { headline: "Save 20% This Week", subheadline: "Limited-time storewide discount." } },
    ]);
  });

  it("hero-banner: omits subheadline entirely when left blank, same as a careful raw-JSON author leaving the key out", async () => {
    const formData = baseCreateFormData("typed-hero-blank-sub", "Typed Hero Blank Sub");
    setSectionSlot(formData, 0, "hero-banner", { headline: "Headline Only" });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-hero-blank-sub");
    expect(page?.sections).toEqual([{ componentType: "hero-banner", config: { headline: "Headline Only" } }]);
  });

  it("ad-slot: yields config: {} (deliberately empty schema -- content resolved at render time from the advertising service)", async () => {
    const formData = baseCreateFormData("typed-ad-slot", "Typed Ad Slot");
    setSectionSlot(formData, 0, "ad-slot");
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-ad-slot");
    expect(page?.sections).toEqual([{ componentType: "ad-slot", config: {} }]);
  });

  it("category-spot: a real multi-select's multiple FormData entries reassemble into an ordered categorySlugs array", async () => {
    const formData = baseCreateFormData("typed-category-spot", "Typed Category Spot");
    setSectionSlot(formData, 0, "category-spot", { categorySlugs: ["embroidery", "custom-coasters"] });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-category-spot");
    expect(page?.sections).toEqual([
      { componentType: "category-spot", config: { categorySlugs: ["embroidery", "custom-coasters"] } },
    ]);
  });

  it("product-grid: a real multi-select's multiple FormData entries reassemble into an ordered productIds array", async () => {
    const formData = baseCreateFormData("typed-product-grid", "Typed Product Grid");
    setSectionSlot(formData, 0, "product-grid", { productIds: ["prod-1", "prod-2", "prod-3"] });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-product-grid");
    expect(page?.sections).toEqual([
      { componentType: "product-grid", config: { productIds: ["prod-1", "prod-2", "prod-3"] } },
    ]);
  });

  it("service-area-info: hours (required) always present, blurb omitted when blank, servicesOffered's comma/newline textarea reassembles into a string array", async () => {
    const formData = baseCreateFormData("typed-service-area", "Typed Service Area");
    setSectionSlot(formData, 0, "service-area-info", {
      hours: "Mon-Sat 8am-7pm",
      servicesOffered: "TV Mounting\nCamera Install, WiFi Mesh",
    });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-service-area");
    expect(page?.sections).toEqual([
      {
        componentType: "service-area-info",
        config: { hours: "Mon-Sat 8am-7pm", servicesOffered: ["TV Mounting", "Camera Install", "WiFi Mesh"] },
      },
    ]);
  });

  it("service-area-info: hours-only matches print-shop's own real seeded shape ({ hours }, no blurb/servicesOffered keys)", async () => {
    const formData = baseCreateFormData("typed-service-area-minimal", "Typed Service Area Minimal");
    setSectionSlot(formData, 0, "service-area-info", { hours: "Mon-Fri 9am-5pm" });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-service-area-minimal");
    expect(page?.sections).toEqual([{ componentType: "service-area-info", config: { hours: "Mon-Fri 9am-5pm" } }]);
  });

  it("multiple slots: a blank-componentType slot is omitted, non-blank slots keep their own independent config shape", async () => {
    const formData = baseCreateFormData("typed-multi-slot", "Typed Multi Slot");
    setSectionSlot(formData, 0, "hero-banner", { headline: "Multi Slot Headline" });
    // slot 1 left entirely blank -- treated as unused.
    setSectionSlot(formData, 2, "category-spot", { categorySlugs: ["apparel"] });
    await createCmsPageAction(formData);

    const page = await cms.getPageBySlug("typed-multi-slot");
    expect(page?.sections).toEqual([
      { componentType: "hero-banner", config: { headline: "Multi Slot Headline" } },
      { componentType: "category-spot", config: { categorySlugs: ["apparel"] } },
    ]);
  });

  it("updateCmsPageAction: editing an existing section's typed fields and saving reproduces the same config shape for the new values, gated by requireAdminPermission", async () => {
    // Seed a page the way the old raw-JSON editor would have produced it,
    // simulating an "existing seeded page" this story's acceptance criteria
    // is about.
    const seeded = await cms.createPage({
      pageType: "category",
      slug: "typed-update-target",
      title: "Typed Update Target",
      sections: [{ componentType: "hero-banner", config: { headline: "Old Headline", subheadline: "Old Subheadline" } }],
    });

    currentSession = sessionFor("viewer");
    const rejectFormData = new FormData();
    rejectFormData.set("demoSlug", "print-shop");
    rejectFormData.set("id", seeded.id);
    rejectFormData.set("title", "Should Not Save");
    setSectionSlot(rejectFormData, 0, "hero-banner", { headline: "Should not save either" });
    await expect(updateCmsPageAction(rejectFormData)).rejects.toThrow(/not authorized/i);
    expect((await cms.getPage(seeded.id))?.sections[0]?.config).toEqual({
      headline: "Old Headline",
      subheadline: "Old Subheadline",
    });

    currentSession = sessionFor("admin");
    const formData = new FormData();
    formData.set("demoSlug", "print-shop");
    formData.set("id", seeded.id);
    formData.set("title", "Typed Update Target");
    setSectionSlot(formData, 0, "hero-banner", { headline: "New Headline" });
    await updateCmsPageAction(formData);

    const updated = await cms.getPage(seeded.id);
    expect(updated?.sections).toEqual([{ componentType: "hero-banner", config: { headline: "New Headline" } }]);
  });
});
