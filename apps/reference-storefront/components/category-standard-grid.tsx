import type { ImageAdapter } from "@mercatus-liber/media";
import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";
import { resolveProductImageAlt, resolveProductImageUrl } from "../lib/product-image";

/**
 * The "category.standard-grid" template -- today's current uniform product
 * grid layout for category/PLP pages, extracted verbatim from
 * app/demo/[demoSlug]/category/[slug]/page.tsx. Zero visual change from
 * before this story.
 */
export function CategoryStandardGrid({
  demoSlug,
  products,
  media,
}: {
  demoSlug: DemoSlug;
  products: Product[];
  media: ImageAdapter;
}) {
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
      {products.map((product) => {
        const imageUrl = resolveProductImageUrl(media, product, { width: 480, height: 360, fit: "cover" });
        const imageAlt = resolveProductImageAlt(product) ?? product.title;
        return (
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
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: "var(--radius)",
                    marginBottom: "var(--space-xs, 8px)",
                  }}
                />
              )}
              {product.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
