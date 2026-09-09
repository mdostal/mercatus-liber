import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";

/**
 * The "category.magazine-grid" template -- asymmetric feature-card layout
 * per "The Slow Catalog", mirroring home-magazine-grid.tsx's structural
 * treatment applied to a product list instead of arbitrary CMS sections:
 * the first product renders as a large full-width feature tile (display
 * typeface), the rest fall into a smaller uniform grid below it. Same real
 * seeded product data/links as category-standard-grid.tsx.
 */
export function CategoryMagazineGrid({ demoSlug, products }: { demoSlug: DemoSlug; products: Product[] }) {
  const [feature, ...rest] = products;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md, 32px)", marginTop: "var(--space-md, 32px)" }}>
      {feature && (
        <a
          href={`/demo/${demoSlug}/products/${feature.slug}`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid var(--color-border, #ddd)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-card, none)",
            padding: "var(--space-lg, 32px)",
            fontFamily: "var(--font-family-display, var(--font-family))",
            fontSize: "var(--font-size-heading-md, 1.5rem)",
          }}
        >
          {feature.title}
        </a>
      )}
      {rest.length > 0 && (
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-sm, 16px)",
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {rest.map((product) => (
            <li
              key={product.id}
              style={{
                border: "1px solid var(--color-border, #ddd)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-card, none)",
                padding: "var(--space-sm, 16px)",
              }}
            >
              <a
                href={`/demo/${demoSlug}/products/${product.slug}`}
                style={{ textDecoration: "none", color: "inherit", fontSize: "var(--font-size-body, 1rem)" }}
              >
                {product.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
