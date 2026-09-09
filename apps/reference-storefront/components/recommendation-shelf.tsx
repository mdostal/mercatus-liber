import type { Money } from "@mercatus-liber/core";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { ImageAdapter } from "@mercatus-liber/media";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import { InteractionTracker } from "./interaction-tracker";
import { resolveProductImageUrl } from "../lib/product-image";

/**
 * The reference-storefront's own display shape for a recommended product --
 * deliberately NOT @mercatus-liber/core's Product (see design-discussion.md
 * §3: recommendations resolves bare productIds to real Products via catalog
 * at render time; this trims that down to just what the shelf renders).
 * `price` is the first SKU's price found for the product (or null for a
 * product with no SKUs yet) -- "price-ish" display data, not a real pricing
 * computation (that stays PDP/bundles' job).
 */
export interface RecommendedProduct {
  slug: string;
  title: string;
  price: Money | null;
  /** image-cdn epic: the product's primary photo, resolved through @mercatus-liber/media's ImageAdapter -- see lib/product-image.ts. `null` when the product has no `images` yet, never a fabricated placeholder URL. */
  imageUrl: string | null;
}

export interface RecommendationShelfData {
  label: string;
  products: RecommendedProduct[];
}

/**
 * The same-category fallback heuristic shared by the PDP and cart pages
 * (see design-discussion.md §3, open question 2): naive, unranked, first-N
 * by whatever order listProductIdsInCategory returns. Deliberately app-layer
 * orchestration, never inside packages/recommendations -- mirrors the exact
 * marketingCatalog.listCategoriesForProduct -> listProductIdsInCategory call
 * chain app/category/[slug]/page.tsx already uses.
 */
async function fallbackCategoryProductIds(
  marketingCatalog: MarketingCatalogService,
  productId: string,
): Promise<string[]> {
  const categories = await marketingCatalog.listCategoriesForProduct(productId);
  const idsByCategory = await Promise.all(
    categories.map((category) => marketingCatalog.listProductIdsInCategory(category.id)),
  );
  const ids = new Set<string>();
  for (const list of idsByCategory) {
    for (const id of list) ids.add(id);
  }
  ids.delete(productId);
  return Array.from(ids);
}

/** Cap on the same-category fallback's own contribution, per source product -- "a reasonable number" per design-discussion.md §3 / open question 2. */
const MAX_FALLBACK_PER_PRODUCT = 4;

/** Cap on the total number of products a single shelf ever renders. */
const MAX_SHELF_PRODUCTS = 8;

/**
 * Resolves bare productIds to real, still-existing Products (silently
 * dropping any id that no longer resolves -- see
 * packages/recommendations/src/types.ts's doc comment on targetProductIds:
 * this package deliberately never validates ids against catalog itself).
 */
async function resolveRecommendedProducts(
  catalog: CatalogService,
  media: ImageAdapter,
  productIds: string[],
): Promise<RecommendedProduct[]> {
  const resolved = await Promise.all(
    productIds.map(async (id): Promise<RecommendedProduct | null> => {
      const product = await catalog.getProduct(id);
      if (!product) return null;
      const skus = await catalog.listSkusByProduct(product.id);
      return {
        slug: product.slug,
        title: product.title,
        price: skus[0]?.price ?? null,
        imageUrl: resolveProductImageUrl(media, product, { width: 300, height: 300, fit: "cover" }),
      };
    }),
  );
  return resolved.filter((product): product is RecommendedProduct => product !== null).slice(0, MAX_SHELF_PRODUCTS);
}

/**
 * PDP composition: curated `pdp`/`both` rules for `productId`, using the
 * matched rule's own label, or -- when no curated rule exists -- the
 * same-category fallback under a generic label. Returns null when there is
 * genuinely nothing to show (no curated rule AND no category-mates), so the
 * page can render no shelf at all (see this story's third acceptance
 * criterion).
 */
export async function resolvePdpRecommendations(
  services: {
    recommendations: RecommendationsService;
    catalog: CatalogService;
    marketingCatalog: MarketingCatalogService;
    media: ImageAdapter;
  },
  productId: string,
): Promise<RecommendationShelfData | null> {
  const { recommendations, catalog, marketingCatalog, media } = services;
  const rules = await recommendations.getRecommendationsForProduct(productId, "pdp");

  let targetIds: string[];
  let label: string;
  const [firstRule] = rules;
  if (firstRule) {
    const ids = new Set<string>();
    for (const rule of rules) {
      for (const id of rule.targetProductIds) ids.add(id);
    }
    targetIds = Array.from(ids);
    label = firstRule.label;
  } else {
    targetIds = (await fallbackCategoryProductIds(marketingCatalog, productId)).slice(0, MAX_FALLBACK_PER_PRODUCT);
    label = "Customers also bought";
  }

  const products = await resolveRecommendedProducts(catalog, media, targetIds);
  if (products.length === 0) return null;
  return { label, products };
}

/**
 * Cart composition: unions curated `cart`/`both` rule targets across every
 * cart line's product, falling back to the same-category heuristic per line
 * when that line's product has zero curated rules, then dedupes and excludes
 * anything already in the cart (see design-discussion.md §3). One shelf, one
 * generic label -- unlike the PDP shelf, a cart shelf aggregates across
 * potentially many source products/rules, so no single rule's label applies.
 */
export async function resolveCartRecommendations(
  services: {
    recommendations: RecommendationsService;
    catalog: CatalogService;
    marketingCatalog: MarketingCatalogService;
    media: ImageAdapter;
  },
  cartProductIds: string[],
): Promise<RecommendationShelfData | null> {
  const { recommendations, catalog, marketingCatalog, media } = services;
  const targetIds = new Set<string>();

  for (const productId of cartProductIds) {
    const rules = await recommendations.getRecommendationsForProduct(productId, "cart");
    if (rules.length > 0) {
      for (const rule of rules) {
        for (const id of rule.targetProductIds) targetIds.add(id);
      }
    } else {
      const fallbackIds = await fallbackCategoryProductIds(marketingCatalog, productId);
      for (const id of fallbackIds.slice(0, MAX_FALLBACK_PER_PRODUCT)) targetIds.add(id);
    }
  }

  for (const productId of cartProductIds) targetIds.delete(productId);

  const products = await resolveRecommendedProducts(catalog, media, Array.from(targetIds));
  if (products.length === 0) return null;
  return { label: "Customers also bought", products };
}

/**
 * Renders one shelf of recommended products, each linking to its own PDP --
 * matches this app's plain-HTML/inline-style conventions (see
 * bundle-tier-selector.tsx). Pure render, no data fetching, same "page
 * resolves data, component renders it" split as BundleTierSelector.
 */
export function RecommendationShelf({ label, products }: RecommendationShelfData) {
  return (
    <section
      style={{
        marginTop: "var(--space-md, 32px)",
        borderTop: "1px solid var(--color-border, #e5e5e5)",
        paddingTop: "var(--space-sm, 16px)",
      }}
    >
      <InteractionTracker
        eventName="recommendation_shelf_viewed"
        properties={{ label, productSlugs: products.map((product) => product.slug) }}
      />
      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>{label}</h2>
      <ul style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm, 16px)", listStyle: "none", padding: 0, margin: 0 }}>
        {products.map((product) => (
          <li
            key={product.slug}
            style={{
              border: "1px solid var(--color-border, #ddd)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-card, none)",
              padding: "var(--space-sm, 16px)",
            }}
          >
            <a
              href={`/products/${product.slug}`}
              style={{ textDecoration: "none", color: "inherit", fontSize: "var(--font-size-body, 1rem)" }}
            >
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt=""
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    borderRadius: "var(--radius)",
                    marginBottom: "var(--space-xs, 8px)",
                  }}
                />
              )}
              {product.title}
            </a>
            {product.price ? (
              <span style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
                {" -- "}
                {(product.price.amount / 100).toFixed(2)} {product.price.currency}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
