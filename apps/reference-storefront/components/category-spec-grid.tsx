import type { ImageAdapter } from "@mercatus-liber/media";
import type { Product } from "@mercatus-liber/core";
import { DS_ATOMS_CSS, DS_FONT_MONO } from "./datasheet-styles";
import type { DemoSlug } from "../lib/demos";
import { resolveProductImageAlt, resolveProductImageUrl } from "../lib/product-image";

/** Real per-product price-range data, computed in category/[slug]/page.tsx from the product's real SKUs (catalog.listSkusByProduct) -- see that file's own doc comment. Additive/optional: the other 3 category templates (standard/magazine/maximalist grid) don't declare this prop, so passing it is a no-op for them. */
export interface CategorySpecRow {
  minPriceCents: number;
  maxPriceCents: number;
  currency: string;
  skuCount: number;
}

/**
 * The "category.spec-grid" template -- the real "Datasheet Storefront"
 * PLP, ported from the approved mockup's `.product-grid`/`.p-card` rules
 * (design-discussion.md §1: "hairline-border grid system (borders *as*
 * the grid, no card shadows), spec-table PDP layout" applied here to the
 * category/PLP listing). Same real seeded product data/links as
 * category-standard-grid.tsx, now enriched with each product's real price
 * range (see CategorySpecRow above) so the spec-sheet rows show a real
 * number, not just a status string.
 */
export function CategorySpecGrid({
  demoSlug,
  products,
  specsByProductId,
  media,
}: {
  demoSlug: DemoSlug;
  products: Product[];
  specsByProductId?: Record<string, CategorySpecRow>;
  media: ImageAdapter;
}) {
  const formatPrice = (spec: CategorySpecRow | undefined): string => {
    if (!spec || spec.skuCount === 0) return "--";
    const low = (spec.minPriceCents / 100).toFixed(2);
    if (spec.minPriceCents === spec.maxPriceCents) return `${low} ${spec.currency}`;
    return `from ${low} ${spec.currency}`;
  };

  return (
    <div className="ds-scope ds-category">
      <style>{DS_ATOMS_CSS}</style>
      <style>{`
        .ds-product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 1px;
          background: var(--color-border, #D2D7E0);
          border: 1px solid var(--color-border, #D2D7E0);
          margin-top: var(--space-sm, 16px);
        }
        .ds-p-card { background: #FFFFFF; display: flex; flex-direction: column; position: relative; }
        .ds-p-card .ds-art {
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background-image:
            linear-gradient(rgba(18, 21, 27, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(18, 21, 27, 0.07) 1px, transparent 1px);
          background-size: 12px 12px;
          border-bottom: 1px solid var(--color-border, #D2D7E0);
          color: var(--color-text, #12151B);
          padding: 20px;
          font-family: ${DS_FONT_MONO};
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--color-muted, #8891A0);
          text-align: center;
        }
        .ds-p-card .ds-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .ds-p-card h3 {
          font-size: 14.5px;
          font-weight: 700;
          line-height: 1.3;
          margin: 0;
          font-family: var(--font-family, sans-serif);
        }
        .ds-p-card h3 a { color: inherit; text-decoration: none; }
        .ds-specsheet {
          font-family: ${DS_FONT_MONO};
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          border-top: 1px solid var(--color-border, #D2D7E0);
          padding-top: 10px;
          margin-top: auto;
        }
        .ds-specsheet .ds-row { display: flex; justify-content: space-between; gap: 8px; }
        .ds-specsheet .ds-row .ds-k { color: var(--color-muted, #8891A0); text-transform: uppercase; letter-spacing: 0.04em; }
        .ds-specsheet .ds-row .ds-v { color: var(--color-text, #12151B); text-align: right; }
        .ds-specsheet .ds-row.price .ds-v { color: var(--color-primary, #C8460A); font-weight: 600; font-size: 13px; }
        .ds-p-card-foot { display: flex; border-top: 1px solid var(--color-border, #D2D7E0); }
        .ds-p-card-foot a {
          flex: 1;
          text-align: center;
          padding: 11px 8px;
          font-family: ${DS_FONT_MONO};
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-accent, #5A6170);
          text-decoration: none;
        }
        .ds-p-card-foot a:hover { color: var(--color-primary, #C8460A); background: var(--color-background, #E7EAF0); }
      `}</style>

      <div className="ds-titleblock">
        <span className="ds-name">
          <span className="ds-num">PLP-01</span>
          Product Listing
        </span>
        <span className="ds-meta">
          <span>{products.length} ITEM{products.length === 1 ? "" : "S"}</span>
        </span>
      </div>

      <div className="ds-product-grid">
        {products.map((product) => {
          const spec = specsByProductId?.[product.id];
          const imageUrl = resolveProductImageUrl(media, product, { width: 480, height: 480, fit: "cover" });
          const imageAlt = resolveProductImageAlt(product) ?? product.title;
          return (
            <div key={product.id} className="ds-p-card">
              <span className="ds-tick tl" aria-hidden="true" />
              <span className="ds-tick tr" aria-hidden="true" />
              <div className="ds-art" style={imageUrl ? { padding: 0 } : undefined}>
                {imageUrl ? (
                  <img src={imageUrl} alt={imageAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  product.title
                )}
              </div>
              <div className="ds-body">
                <span className="ds-chip">{product.status}</span>
                <h3>
                  <a href={`/demo/${demoSlug}/products/${product.slug}`}>{product.title}</a>
                </h3>
                <div className="ds-specsheet">
                  <div className="ds-row">
                    <span className="ds-k">SKUs</span>
                    <span className="ds-v">{spec?.skuCount ?? "--"}</span>
                  </div>
                  <div className="ds-row price">
                    <span className="ds-k">Price</span>
                    <span className="ds-v">{formatPrice(spec)}</span>
                  </div>
                </div>
              </div>
              <div className="ds-p-card-foot">
                <a href={`/demo/${demoSlug}/products/${product.slug}`}>View spec</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
