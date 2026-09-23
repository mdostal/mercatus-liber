import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { RecommendationShelf, type RecommendationShelfData } from "../components/recommendation-shelf.js";

/**
 * commerce-gap-audit-3: a real, live bug found by browsing all 3 demos --
 * every "Customers also bought" card link was a bare `/products/<slug>`
 * with no `/demo/<demoSlug>` prefix, so clicking it 404'd against the
 * demo-agnostic root instead of the product's real page, on every demo,
 * on both the PDP and cart pages that render this shelf. `RecommendationShelf`
 * is a plain, synchronous, pure-render function component (no hooks, no
 * data fetching -- see its own doc comment), so it can be called directly
 * and its returned element tree walked, unlike the async Server Components
 * elsewhere in this app (see reviews.test.ts's own `renderedText` helper's
 * doc comment for why those need a different technique).
 */
function collectHrefs(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap(collectHrefs);
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as { type: unknown; props: { children?: ReactNode; href?: string } };
    const own = element.type === "a" && typeof element.props.href === "string" ? [element.props.href] : [];
    return [...own, ...collectHrefs(element.props?.children)];
  }
  return [];
}

const twoProducts: RecommendationShelfData = {
  label: "Customers also bought",
  products: [
    { slug: "embroidered-dad-cap", title: "Embroidered Dad Cap", price: { amount: 2500, currency: "USD" }, imageUrl: null },
    { slug: "embroidered-fleece-hoodie", title: "Embroidered Fleece Hoodie", price: { amount: 4800, currency: "USD" }, imageUrl: null },
  ],
};

describe("RecommendationShelf", () => {
  it("links every recommended product to its own demo-prefixed PDP, not a bare /products/<slug>", () => {
    const element = RecommendationShelf({ demoSlug: "print-shop", ...twoProducts });
    const hrefs = collectHrefs(element);

    expect(hrefs).toEqual([
      "/demo/print-shop/products/embroidered-dad-cap",
      "/demo/print-shop/products/embroidered-fleece-hoodie",
    ]);
    for (const href of hrefs) {
      expect(href.startsWith("/products/")).toBe(false);
    }
  });

  it("uses the given demoSlug for every link, not a hardcoded demo", () => {
    const element = RecommendationShelf({ demoSlug: "northline", ...twoProducts });
    const hrefs = collectHrefs(element);
    expect(hrefs.every((href) => href.startsWith("/demo/northline/products/"))).toBe(true);
  });
});
