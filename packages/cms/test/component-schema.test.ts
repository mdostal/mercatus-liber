import { describe, expect, it } from "vitest";
import { createComponentRegistry, DEFAULT_COMPONENTS } from "../src/component-registry.js";
import type { ComponentFieldSchema } from "../src/types.js";

/**
 * scc-02: every one of the 5 default component types now carries a real
 * fields[] schema, grounded in what apps/reference-storefront/lib/seed.ts,
 * seed-northline.ts, and seed-broadleaf.ts actually put in that type's
 * config today. This is purely additive metadata -- it does not change
 * ComponentInstance.config's runtime shape (a plain object), so it's
 * covered here, separately from cms.test.ts's existing behavioral suite,
 * which must keep passing unmodified.
 */
describe("component field schema", () => {
  const registry = createComponentRegistry();

  const expectedKeysByType: Record<string, string[]> = {
    "hero-banner": ["headline", "subheadline"],
    "ad-slot": [],
    "category-spot": ["categorySlugs"],
    "product-grid": ["productIds"],
    "service-area-info": ["hours", "blurb", "servicesOffered"],
  };

  it("every default component has a fields[] array (possibly empty, never missing)", () => {
    for (const def of DEFAULT_COMPONENTS) {
      expect(Array.isArray(def.fields)).toBe(true);
    }
  });

  it("hero-banner's fields match real seed usage: headline + subheadline (both text)", () => {
    const fields = registry.get("hero-banner")?.fields ?? [];
    expect(fields.map((f) => f.key)).toEqual(expectedKeysByType["hero-banner"]);
    for (const f of fields) expect(f.kind).toBe("text");
    expect(fields.find((f) => f.key === "headline")?.required).toBe(true);
  });

  it("ad-slot has no fields -- its config is never populated in real seed data (always {})", () => {
    const fields = registry.get("ad-slot")?.fields ?? [];
    expect(fields).toEqual([]);
  });

  it("category-spot's field is categorySlugs, kind categoryRef", () => {
    const fields = registry.get("category-spot")?.fields ?? [];
    expect(fields.map((f) => f.key)).toEqual(expectedKeysByType["category-spot"]);
    expect(fields[0]?.kind).toBe("categoryRef");
  });

  it("product-grid's field is productIds, kind productRef", () => {
    const fields = registry.get("product-grid")?.fields ?? [];
    expect(fields.map((f) => f.key)).toEqual(expectedKeysByType["product-grid"]);
    expect(fields[0]?.kind).toBe("productRef");
  });

  it("service-area-info's fields match real seed usage: hours, blurb, servicesOffered", () => {
    const fields = registry.get("service-area-info")?.fields ?? [];
    expect(fields.map((f) => f.key)).toEqual(expectedKeysByType["service-area-info"]);
    expect(fields.find((f) => f.key === "hours")?.required).toBe(true);
  });

  it("no default component declares a field whose key wasn't found in real seed config usage", () => {
    for (const def of DEFAULT_COMPONENTS) {
      const actualKeys = (def.fields ?? []).map((f) => f.key);
      expect(actualKeys).toEqual(expectedKeysByType[def.type]);
    }
  });

  it("ComponentFieldSchema's kind is restricted to the closed set the registry actually uses", () => {
    const allowedKinds: ComponentFieldSchema["kind"][] = [
      "text",
      "richtext",
      "image",
      "productRef",
      "categoryRef",
      "number",
      "boolean",
    ];
    for (const def of DEFAULT_COMPONENTS) {
      for (const field of def.fields ?? []) {
        expect(allowedKinds).toContain(field.kind);
      }
    }
  });

  it("register() with a custom definition (no fields) still works -- fields is optional, not required", () => {
    const custom = createComponentRegistry([{ type: "custom", label: "Custom", description: "no schema yet" }]);
    expect(custom.get("custom")?.fields).toBeUndefined();
  });
});
