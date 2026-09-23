import type { ImageAdapter } from "@mercatus-liber/media";
import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";
import { resolveProductImageAlt, resolveProductImageUrl } from "../lib/product-image";

const AREA_NAMES = ["feature", "b", "c", "d", "e"] as const;

/**
 * Same asymmetric-grid math as home-magazine-grid.tsx's magazineAreas --
 * duplicated (not shared) since each of this epic's 5 template components
 * carries its own self-contained <style> block per the task's own
 * instruction, and the two components' item shapes (CMS sections vs.
 * products) are different enough that a shared helper module would be a
 * bigger cross-file change than this epic's scope calls for.
 */
function magazineAreas(count: number): { template: string; columns: string } {
  const columns = "1.55fr 1fr 1fr";
  if (count <= 1) return { template: `"feature feature feature"`, columns };
  if (count === 2) return { template: `"feature b b"`, columns };
  return { template: `"feature b c" "feature d e"`, columns };
}

/**
 * The "category.magazine-grid" template -- asymmetric feature-card layout
 * per "The Slow Catalog", mirroring home-magazine-grid.tsx's structural
 * treatment applied to a real product list instead of arbitrary CMS
 * sections: the first product renders as a large feature tile (display
 * typeface, the mockup's own `.catalog-grid` `grid-template-areas`), the
 * next up to 4 fall into the mockup's "b/c/d/e" cells, and any further
 * products (real category listings vary in size) flow into a simple wrap
 * grid below using the same card treatment. Same real seeded product
 * data/links as category-standard-grid.tsx -- title/slug/description, plus
 * (image-cdn epic) each product's real photo when it has one, resolved via
 * the shared resolveProductImageUrl helper; price/stock still live on
 * `Sku`, which this template doesn't receive, so no price/stock is
 * fabricated here. Only ever selected by the "editorial" bundle, so this
 * file's styling is safe to apply unconditionally.
 */
export function CategoryMagazineGrid({
  demoSlug,
  products,
  media,
}: {
  demoSlug: DemoSlug;
  products: Product[];
  media: ImageAdapter;
}) {
  const [feature, ...rest] = products;
  const areas = magazineAreas(rest.length);
  const gridItems = rest.slice(0, 5);
  const overflow = rest.slice(5);

  const productImage = (product: Product, opts: { width: number; height: number }) => ({
    url: resolveProductImageUrl(media, product, { ...opts, fit: "cover" }),
    alt: resolveProductImageAlt(product) ?? product.title,
  });

  return (
    <div className="ed-category">
      <style>{`
        .ed-category .ed-feature-tile { display: block; text-decoration: none; color: inherit; background: var(--color-surface, #FBF6E9); border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); padding: 2rem; margin-top: 2rem; margin-bottom: 1.5rem; transition: transform .18s ease, box-shadow .18s ease; box-shadow: var(--shadow-card, none); }
        .ed-category .ed-feature-tile:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(36,28,20,.35); }
        .ed-category .ed-feature-tile .ed-ph { aspect-ratio: 16/7; margin-bottom: 1.25rem; border: 1px solid var(--color-border, #C7B586); background: linear-gradient(160deg, hsl(20 15% 30%), hsl(15 45% 42%)); border-radius: calc(var(--radius) - 1px); }
        .ed-category .ed-feature-tile h2 { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: clamp(1.5rem, 3vw, 2.1rem); }
        .ed-category .ed-feature-tile p { font-family: var(--font-family); color: var(--color-muted, #55493A); margin-top: .6rem !important; max-width: 60ch; line-height: 1.5; }
        .ed-catalog-grid { display: grid; gap: 1.25rem; grid-template-columns: ${areas.columns}; grid-template-areas: ${areas.template}; margin-bottom: 1.5rem; }
        .ed-card { display: flex; flex-direction: column; background: var(--color-surface, #FBF6E9); border: 1px solid var(--color-border, #C7B586); border-radius: var(--radius); overflow: hidden; text-decoration: none; color: inherit; transition: transform .18s ease, box-shadow .18s ease; box-shadow: var(--shadow-card, none); }
        .ed-card:hover { transform: translateY(-3px); box-shadow: 0 16px 28px -16px rgba(36,28,20,.35); }
        .ed-card .ed-ph { aspect-ratio: 5/3.3; border-bottom: 1px solid var(--color-border, #C7B586); background: linear-gradient(160deg, hsl(25 20% 55%), hsl(25 25% 35%)); }
        .ed-card-feature .ed-ph { aspect-ratio: 4/3.4; }
        .ed-card .ed-card-body { padding: 1rem; }
        .ed-card h2 { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: 1.1rem; line-height: 1.25; margin: 0; }
        .ed-card-feature h2 { font-size: 1.4rem; }
        .ed-card p { font-family: var(--font-family); font-size: .9rem; color: var(--color-muted, #55493A); line-height: 1.5; margin: .4rem 0 0; }
        .ed-overflow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1.25rem; }
        @media (max-width: 780px) {
          .ed-catalog-grid { grid-template-columns: 1fr; grid-template-areas: "feature" "b" "c" "d" "e"; }
        }
      `}</style>

      {feature &&
        (() => {
          const image = productImage(feature, { width: 960, height: 420 });
          return (
            <a className="ed-feature-tile" href={`/demo/${demoSlug}/products/${feature.slug}`}>
              {image.url ? (
                <img className="ed-ph" src={image.url} alt={image.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div className="ed-ph" />
              )}
              <h2>{feature.title}</h2>
              {feature.description && <p>{feature.description}</p>}
            </a>
          );
        })()}

      {gridItems.length > 0 && (
        <div className="ed-catalog-grid">
          {gridItems.map((product, i) => {
            const image = productImage(product, { width: 500, height: 330 });
            return (
              <a
                key={product.id}
                className={`ed-card${i === 0 ? " ed-card-feature" : ""}`}
                href={`/demo/${demoSlug}/products/${product.slug}`}
                style={{ gridArea: AREA_NAMES[i] }}
              >
                {image.url ? (
                  <img className="ed-ph" src={image.url} alt={image.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div className="ed-ph" />
                )}
                <div className="ed-card-body">
                  {/* a11y-audit: this category's own page.tsx renders exactly one <h1> and
                      the "feature" tile above (when present) renders one <h2> -- but the
                      "feature" is optional ({feature && ...}), so any category without a
                      spotlighted product previously hit this <h3> as the first heading
                      after the page's <h1>, skipping a level (real, code-inspection-
                      confirmed; not reproduced live today only because this demo's seeded
                      categories all happen to have a feature product). <h2> keeps every
                      card a same-level sibling of the feature tile's own <h2>. */}
                  <h2>{product.title}</h2>
                  {product.description && <p>{product.description}</p>}
                </div>
              </a>
            );
          })}
        </div>
      )}

      {overflow.length > 0 && (
        <div className="ed-overflow-grid">
          {overflow.map((product) => {
            const image = productImage(product, { width: 500, height: 330 });
            return (
              <a key={product.id} className="ed-card" href={`/demo/${demoSlug}/products/${product.slug}`}>
                {image.url ? (
                  <img className="ed-ph" src={image.url} alt={image.alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div className="ed-ph" />
                )}
                <div className="ed-card-body">
                  {/* a11y-audit: this category's own page.tsx renders exactly one <h1> and
                      the "feature" tile above (when present) renders one <h2> -- but the
                      "feature" is optional ({feature && ...}), so any category without a
                      spotlighted product previously hit this <h3> as the first heading
                      after the page's <h1>, skipping a level (real, code-inspection-
                      confirmed; not reproduced live today only because this demo's seeded
                      categories all happen to have a feature product). <h2> keeps every
                      card a same-level sibling of the feature tile's own <h2>. */}
                  <h2>{product.title}</h2>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
