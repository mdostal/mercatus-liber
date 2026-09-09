import type { Product } from "@mercatus-liber/core";
import type { DemoSlug } from "../lib/demos";

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
 * data/links as category-standard-grid.tsx -- title/slug/description only
 * (this repo's `Product` type has no image/price field at this list level;
 * price/stock live on `Sku`, which this template doesn't receive, so no
 * price/stock is fabricated here). Only ever selected by the "editorial"
 * bundle, so this file's styling is safe to apply unconditionally.
 */
export function CategoryMagazineGrid({ demoSlug, products }: { demoSlug: DemoSlug; products: Product[] }) {
  const [feature, ...rest] = products;
  const areas = magazineAreas(rest.length);
  const gridItems = rest.slice(0, 5);
  const overflow = rest.slice(5);

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
        .ed-card h3 { font-family: var(--font-family-display, var(--font-family)); font-weight: 600; font-size: 1.1rem; line-height: 1.25; margin: 0; }
        .ed-card-feature h3 { font-size: 1.4rem; }
        .ed-card p { font-family: var(--font-family); font-size: .9rem; color: var(--color-muted, #55493A); line-height: 1.5; margin: .4rem 0 0; }
        .ed-overflow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1.25rem; }
        @media (max-width: 780px) {
          .ed-catalog-grid { grid-template-columns: 1fr; grid-template-areas: "feature" "b" "c" "d" "e"; }
        }
      `}</style>

      {feature && (
        <a className="ed-feature-tile" href={`/demo/${demoSlug}/products/${feature.slug}`}>
          <div className="ed-ph" />
          <h2>{feature.title}</h2>
          {feature.description && <p>{feature.description}</p>}
        </a>
      )}

      {gridItems.length > 0 && (
        <div className="ed-catalog-grid">
          {gridItems.map((product, i) => (
            <a
              key={product.id}
              className={`ed-card${i === 0 ? " ed-card-feature" : ""}`}
              href={`/demo/${demoSlug}/products/${product.slug}`}
              style={{ gridArea: AREA_NAMES[i] }}
            >
              <div className="ed-ph" />
              <div className="ed-card-body">
                <h3>{product.title}</h3>
                {product.description && <p>{product.description}</p>}
              </div>
            </a>
          ))}
        </div>
      )}

      {overflow.length > 0 && (
        <div className="ed-overflow-grid">
          {overflow.map((product) => (
            <a key={product.id} className="ed-card" href={`/demo/${demoSlug}/products/${product.slug}`}>
              <div className="ed-ph" />
              <div className="ed-card-body">
                <h3>{product.title}</h3>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
