import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";

/**
 * The "category.spec-grid" template -- dense datasheet-style treatment per
 * "Datasheet Storefront": a literal hairline-bordered data table instead of
 * a card grid (design-discussion.md §1: "spec-table PDP layout" applied
 * here to the category/PLP listing). Same real seeded product data/links as
 * category-standard-grid.tsx.
 */
export function CategorySpecGrid({ demoSlug, products }: { demoSlug: DemoSlug; products: Product[] }) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginTop: "var(--space-md, 32px)",
        fontSize: "var(--font-size-body, 1rem)",
      }}
    >
      <tbody>
        {products.map((product) => (
          <tr key={product.id} style={{ borderBottom: "1px solid var(--color-border, #ddd)" }}>
            <td style={{ padding: "var(--space-xs, 8px)" }}>
              <a href={`/demo/${demoSlug}/products/${product.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                {product.title}
              </a>
            </td>
            <td
              style={{
                padding: "var(--space-xs, 8px)",
                color: "var(--color-muted, #666)",
                textAlign: "right",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {product.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
