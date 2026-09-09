import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";

/**
 * The "category.standard-grid" template -- today's current uniform product
 * grid layout for category/PLP pages, extracted verbatim from
 * app/demo/[demoSlug]/category/[slug]/page.tsx. Zero visual change from
 * before this story.
 */
export function CategoryStandardGrid({ demoSlug, products }: { demoSlug: DemoSlug; products: Product[] }) {
  return (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--space-sm, 16px)",
        listStyle: "none",
        padding: 0,
        marginTop: "var(--space-md, 32px)",
      }}
    >
      {products.map((product) => (
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
  );
}
