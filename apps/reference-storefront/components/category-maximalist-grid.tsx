import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";
import { resolveProductImageAlt, resolveProductImageUrl } from "../lib/product-image";
import { getServicesForDemo } from "../lib/services";

/**
 * The "category.maximalist-grid" template -- the real "Blaze Theme"
 * category/PLP layout: a uniform grid of the same sticker-style product
 * cards home-maximalist-grid.tsx uses (mockup's `.category-grid`/`.card`),
 * not the mockup's asymmetric home bento (design-discussion.md's "a
 * uniform grid using the same card style" for category pages). Genuinely
 * missing before this fix -- "maximalist" previously pointed `category` at
 * the generic `category.standard-grid` key.
 *
 * Same real seeded Product[] this page type has always received
 * (category-standard-grid.tsx/category-spec-grid.tsx's own prop shape) plus
 * one additive real data fetch (catalog.listSkusByProduct, same helper
 * pattern as home-maximalist-grid.tsx) for a real representative price --
 * never a fabricated one. `mx-`-prefixed classes throughout per this epic's
 * collision-avoidance convention.
 */
export async function CategoryMaximalistGrid({ demoSlug, products }: { demoSlug: DemoSlug; products: Product[] }) {
  const { catalog, media } = await getServicesForDemo(demoSlug);
  const cards = await Promise.all(
    products.map(async (product) => {
      const skus = await catalog.listSkusByProduct(product.id);
      const priceLabel =
        skus.length > 0
          ? `${(Math.min(...skus.map((s) => s.price.amount)) / 100).toFixed(2)} ${skus[0]!.price.currency}`
          : null;
      const imageUrl = resolveProductImageUrl(media, product, { width: 480, height: 360, fit: "cover" });
      const imageAlt = resolveProductImageAlt(product) ?? product.title;
      return { product, priceLabel, imageUrl, imageAlt };
    }),
  );

  return (
    <div className="mx-category">
      <style>{MX_CATEGORY_CSS}</style>
      <div className="mx-category-grid">
        {cards.map(({ product, priceLabel, imageUrl, imageAlt }) => (
          <a key={product.id} href={`/demo/${demoSlug}/products/${product.slug}`} className="mx-card">
            <div className="mx-card-art">
              {imageUrl ? (
                <img className="mx-card-img" src={imageUrl} alt={imageAlt} />
              ) : (
                <span className="mx-card-glyph">{product.title.slice(0, 1).toUpperCase()}</span>
              )}
              <span className="mx-card-tag">{product.status}</span>
            </div>
            <div className="mx-card-body">
              {/* a11y-audit: category/[slug]/page.tsx renders this category's own <h1>
                  and nothing else before this grid -- an <h3> here skipped a level,
                  confirmed live via axe-core's heading-order rule (maximalist theme).
                  <h2> is correct (each card is a same-level sibling section). */}
              <h2>{product.title}</h2>
              <div className="mx-card-foot">
                <span className="mx-price">{priceLabel ?? "—"}</span>
                <span className="mx-quickadd">View</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

const MX_CATEGORY_CSS = `
  .mx-category-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 22px; margin-top: var(--space-md, 20px); }

  .mx-card {
    background: #fff; border: 3px solid var(--color-border, #17130F); border-radius: 16px;
    box-shadow: 6px 6px 0 var(--color-border, #17130F); display: flex; flex-direction: column;
    overflow: hidden; transition: transform 150ms ease, box-shadow 150ms ease; text-decoration: none;
    color: inherit;
  }
  .mx-card:hover { transform: translate(-3px, -3px); box-shadow: 9px 9px 0 var(--color-border, #17130F); }
  .mx-card-art {
    position: relative; padding: 22px; min-height: 150px; display: flex; align-items: center;
    justify-content: center; border-bottom: 3px solid var(--color-border, #17130F); background: #C6401F;
  }
  .mx-card-glyph {
    font-family: 'Anton', sans-serif; font-size: 48px; color: #fff; -webkit-text-stroke: 1.5px var(--color-border, #17130F);
  }
  .mx-card-img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  }
  .mx-card-tag {
    position: absolute; top: 10px; left: 10px; background: #fff; color: var(--color-text, #17130F);
    border: 2px solid var(--color-border, #17130F); border-radius: 999px; font-family: 'Space Mono', monospace;
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; padding: 3px 9px; text-transform: uppercase;
  }
  .mx-card-body { padding: 18px 18px 20px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
  .mx-card-body h2 {
    font-family: var(--font-family, 'Archivo', sans-serif); font-weight: 800; font-size: 17px;
    text-transform: none; letter-spacing: 0; margin: 0;
  }
  .mx-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 6px; }
  .mx-price { font-family: 'Space Mono', ui-monospace, monospace; font-weight: 700; font-size: 19px; }
  .mx-quickadd {
    border: 2.5px solid var(--color-border, #17130F); background: var(--color-primary, #FF4515);
    color: var(--color-text, #17130F); border-radius: 8px; font-weight: 800; font-size: 12px;
    text-transform: uppercase; padding: 7px 11px; box-shadow: 3px 3px 0 var(--color-border, #17130F);
  }
`;
