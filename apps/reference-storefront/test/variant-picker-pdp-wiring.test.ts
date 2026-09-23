/**
 * commerce-gap-audit-3, finding #8 (variant-picker.tsx): variant-picker.test.ts
 * covers the component itself in isolation; this file covers the other half
 * of that finding's own instruction -- "test that it doesn't render at all
 * for a single-SKU product." That decision isn't made by VariantPicker
 * itself (it has no SKU-count guard of its own -- see its own doc comment,
 * "Only ever rendered by a PDP template when the product has 2+ SKUs"), it's
 * made by app/demo/[demoSlug]/products/[slug]/page.tsx (`viewModel.skus.length
 * > 1`) and each PDP template's own matching guard (e.g.
 * components/pdp-tabbed-detail.tsx's `{skus.length > 1 && activeSku ? ... :
 * null}`), so this proves the real, live decision at the one real call site,
 * not a re-implementation of the guard.
 *
 * Unlike reviews.test.ts's own `renderedText` walker (which flattens a
 * Server Component tree to plain text by directly invoking every
 * function-component element it finds), this file can't use that same
 * technique to detect VariantPicker specifically: VariantPicker calls a real
 * hook (`useRef`), and invoking it as a bare function outside a real React
 * render throws "Invalid hook call" -- `renderedText`'s own try/catch
 * silently swallows that and renders nothing for it, which would make a
 * "does VariantPicker render" assertion pass or fail for the wrong reason.
 * Confirmed empirically while writing this test (a first draft using
 * `renderedText` + a text marker failed against the real multi-SKU case,
 * even though VariantPicker genuinely is in the returned tree). This file's
 * `findElementByType` walker instead invokes every function-component
 * element EXCEPT ones matching the exact, imported `VariantPicker` function
 * reference -- so it still reaches deep into the real async PDP template
 * tree (PdpLongScroll etc. are themselves `async function` Server
 * Components) but stops and records VariantPicker's own real props (the
 * real `optionValues`/`selection` the page computed) without ever calling
 * it. Same base recursive shape as reviews.test.ts's own renderedText.
 *
 * Same setup shape as reviews.test.ts (real, in-memory-backed services,
 * getServicesForDemo mocked wholesale so ProductPage can be invoked directly
 * without a real Next.js request, next/headers' cookies() stubbed to "no
 * cookie present") -- this file never exercises theme selection either, so
 * the same harmless stub is enough.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createPassthroughImageAdapter } from "@mercatus-liber/media";
import { createPdpService } from "@mercatus-liber/pdp";
import { createInMemoryRecommendationRepository, createRecommendationsService } from "@mercatus-liber/recommendations";
import { createInMemoryReviewRepository, createReviewsService } from "@mercatus-liber/reviews";
import { createThemingService } from "@mercatus-liber/theming";
import { VariantPicker } from "../components/variant-picker.js";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const events = createInMemoryEventBus();
const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices(events);
await seedCatalog(catalog, marketingCatalog, cms, inventory);

const theming = createThemingService();
const pdp = createPdpService({ catalog, theming });
const bundles = createBundlesService({ repository: createInMemoryBundleRepository(), skuLookup: catalog });
const recommendations = createRecommendationsService({ repository: createInMemoryRecommendationRepository() });
const media = createPassthroughImageAdapter();
const reviews = createReviewsService({ repository: createInMemoryReviewRepository(), events });

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({
    catalog,
    marketingCatalog,
    cms,
    inventory,
    pdp,
    theming,
    bundles,
    recommendations,
    media,
    reviews,
  })),
}));

const { default: ProductPage } = await import("../app/demo/[demoSlug]/products/[slug]/page.js");

type VariantPickerProps = {
  basePath: string;
  optionValues: { key: string; values: unknown[] }[];
  selection: Record<string, string>;
};

/** Walks a Server Component's returned element tree (invoking every function-component element along the way, including async ones -- same base recursion as reviews.test.ts's renderedText) looking for the first element whose `type` is exactly `target`. Never invokes an element matching `target` itself -- returns its element (type + real props) instead, so a hook-using target component like VariantPicker is detected without ever being called outside a real React render. */
async function findElementByType<P>(node: ReactNode, target: unknown): Promise<{ type: unknown; props: P } | undefined> {
  if (node === null || node === undefined || typeof node === "boolean") return undefined;
  if (typeof node === "string" || typeof node === "number") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = await findElementByType<P>(child, target);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as { type: unknown; props: { children?: ReactNode } };
    if (element.type === target) return element as { type: unknown; props: P };
    if (typeof element.type === "function") {
      try {
        const result = (element.type as (props: unknown) => ReactNode | Promise<ReactNode>)(element.props);
        return findElementByType<P>(result instanceof Promise ? await result : result, target);
      } catch {
        return findElementByType<P>(element.props?.children, target);
      }
    }
    return findElementByType<P>(element.props?.children, target);
  }
  return undefined;
}

const testParams = (slug: string) => Promise.resolve({ demoSlug: "print-shop" as const, slug });
const emptySearchParams = Promise.resolve({});

describe("VariantPicker PDP wiring (pc-01): the real skus.length > 1 rendering decision", () => {
  it("never mounts <VariantPicker> at all for a real single-SKU product (embroidered-dad-cap, one seeded SKU)", async () => {
    const product = await catalog.getProductBySlug("embroidered-dad-cap");
    if (!product) throw new Error("expected the seeded embroidered-dad-cap product");
    const skus = await catalog.listSkusByProduct(product.id);
    expect(skus).toHaveLength(1);

    const element = await ProductPage({ params: testParams("embroidered-dad-cap"), searchParams: emptySearchParams });
    const found = await findElementByType(element, VariantPicker);

    expect(found).toBeUndefined();
  });

  it("mounts the real <VariantPicker> with the real optionValues for the real multi-SKU product (embroidered-performance-polo, 6 seeded color x size SKUs)", async () => {
    const product = await catalog.getProductBySlug("embroidered-performance-polo");
    if (!product) throw new Error("expected the seeded embroidered-performance-polo product");
    const skus = await catalog.listSkusByProduct(product.id);
    expect(skus.length).toBeGreaterThan(1);

    const element = await ProductPage({ params: testParams("embroidered-performance-polo"), searchParams: emptySearchParams });
    const found = await findElementByType<VariantPickerProps>(element, VariantPicker);

    expect(found).toBeDefined();
    expect(found!.props.basePath).toBe("/demo/print-shop/products/embroidered-performance-polo");
    expect(found!.props.optionValues.map((o) => o.key)).toEqual(["color", "size"]);
    expect(found!.props.optionValues.find((o) => o.key === "color")?.values).toEqual(["navy", "charcoal-heather"]);
    expect(found!.props.optionValues.find((o) => o.key === "size")?.values).toEqual(["small", "medium", "large"]);
    // No selection param supplied -- resolves to the first real SKU's own
    // combination (navy/small), per the page's own documented fallback.
    expect(found!.props.selection).toEqual({ color: "navy", size: "small" });
  });

  it("resolves a real ?color=&size= selection through pdp.resolveSelection to the matching real SKU, and passes that exact combination to <VariantPicker selection={...}>", async () => {
    const withSelection = Promise.resolve({ demoSlug: "print-shop" as const, slug: "embroidered-performance-polo" });
    const element = await ProductPage({
      params: withSelection,
      searchParams: Promise.resolve({ color: "charcoal-heather", size: "large" }),
    });

    const found = await findElementByType<VariantPickerProps>(element, VariantPicker);
    expect(found).toBeDefined();
    expect(found!.props.selection).toEqual({ color: "charcoal-heather", size: "large" });
  });

  it("falls back to the first real SKU's own combination for a nonsense/stale selection param that matches none of this product's real values", async () => {
    const element = await ProductPage({
      params: testParams("embroidered-performance-polo"),
      searchParams: Promise.resolve({ color: "does-not-exist", size: "also-fake" }),
    });

    const found = await findElementByType<VariantPickerProps>(element, VariantPicker);
    expect(found).toBeDefined();
    expect(found!.props.selection).toEqual({ color: "navy", size: "small" });
  });
});
