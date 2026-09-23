import type { ComponentInstance } from "@mercatus-liber/cms";
import type { DemoSlug } from "../lib/demos";
import { resolveProductImageAlt, resolveProductImageUrl } from "../lib/product-image";
import { getServicesForDemo } from "../lib/services";

/** Shared card treatment for product/category tile-shaped list items -- border + shadow using the enriched classic bundle's tokens (with fallbacks for the six bundles that don't define them). See design-discussion.md §3: "a subtle card treatment for product/category tiles." */
const TILE_CARD_STYLE = {
  border: "1px solid var(--color-border, #ddd)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow-card, none)",
  padding: "var(--space-sm, 16px)",
} as const;

/** Shared grid layout for a list of tile cards (ProductGrid, CategorySpot, category/search listings). */
const TILE_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "var(--space-sm, 16px)",
  listStyle: "none",
  padding: 0,
  margin: 0,
} as const;

async function HeroBanner({ config }: { config: Record<string, unknown> }) {
  return (
    <section style={{ padding: "var(--space-md, 32px)", background: "#222", color: "#fff", marginBottom: "var(--space-sm, 16px)" }}>
      <h1 style={{ margin: 0, fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>{String(config.headline ?? "")}</h1>
      {config.subheadline ? (
        <p style={{ margin: "var(--space-xs, 8px) 0 0", fontSize: "var(--font-size-body, 1rem)" }}>{String(config.subheadline)}</p>
      ) : null}
    </section>
  );
}

async function CategorySpot({ demoSlug, config }: { demoSlug: DemoSlug; config: Record<string, unknown> }) {
  const { marketingCatalog } = await getServicesForDemo(demoSlug);
  const slugs = Array.isArray(config.categorySlugs) ? (config.categorySlugs as string[]) : [];
  const categories = (await Promise.all(slugs.map((slug) => marketingCatalog.getCategoryBySlug(slug)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  return (
    <section style={{ marginBottom: "var(--space-sm, 16px)" }}>
      <h2 style={{ fontSize: "var(--font-size-heading-md, 1.5rem)" }}>Shop by category</h2>
      <ul style={TILE_GRID_STYLE}>
        {categories.map((category) => (
          <li key={category.id} style={TILE_CARD_STYLE}>
            <a
              href={`/demo/${demoSlug}/category/${category.slug}`}
              style={{ textDecoration: "none", color: "inherit", fontSize: "var(--font-size-body, 1rem)" }}
            >
              {category.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ProductGrid({ demoSlug, config }: { demoSlug: DemoSlug; config: Record<string, unknown> }) {
  const { catalog, media } = await getServicesForDemo(demoSlug);
  const productIds = Array.isArray(config.productIds) ? (config.productIds as string[]) : [];
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  return (
    <section>
      <ul style={TILE_GRID_STYLE}>
        {products.map((product) => {
          // image-cdn epic: resolveProductImageUrl returns null (no fabricated
          // placeholder) when this product has no photos -- the <img> is simply
          // omitted in that case, same card as before this epic.
          const imageUrl = resolveProductImageUrl(media, product, { width: 480, height: 360, fit: "cover" });
          const imageAlt = resolveProductImageAlt(product) ?? product.title;
          return (
            <li key={product.id} style={TILE_CARD_STYLE}>
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
    </section>
  );
}

async function ServiceAreaInfo({ config }: { config: Record<string, unknown> }) {
  return (
    <section style={{ marginBottom: "var(--space-sm, 16px)" }}>
      {config.hours ? (
        <p style={{ fontSize: "var(--font-size-body, 1rem)" }}>
          <strong>Hours:</strong> {String(config.hours)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Fills the CMS "ad-slot" component with a real campaign creative, the same
 * app-layer composition idiom CategorySpot/ProductGrid use for their own
 * data (see design-discussion.md §3 -- packages/cms itself never knows
 * about advertising). Resolves the currently-eligible creative for this
 * slot's page-slug/service-area targeting and renders a simple promotional
 * block; when nothing is eligible, renders nothing (not an error state).
 */
async function AdSlot({
  demoSlug,
  pageSlug,
  serviceAreaId,
}: {
  demoSlug: DemoSlug;
  pageSlug?: string;
  serviceAreaId?: string;
}) {
  const { advertising } = await getServicesForDemo(demoSlug);
  // commerce-gap-audit-3: demoSlug was already threaded into this component
  // but never actually passed to getActiveCreativeForSlot -- under the
  // shared Postgres backend print-shop and Northline Home Tech both resolve
  // to, that meant every untargeted campaign (seeded by every demo) was
  // eligible on every OTHER demo's ad slots too. Confirmed live before this
  // fix: Northline's "Whole-Home WiFi Mesh Installs" creative rendering on
  // print-shop's own home page.
  const result = await advertising.getActiveCreativeForSlot({ pageSlug, serviceAreaId, demoSlug });
  if (!result) return null;

  const { creative } = result;
  return (
    <section
      style={{
        padding: "var(--space-md, 32px)",
        background: "#f5f5f5",
        border: "1px solid var(--color-border, #ddd)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-card, none)",
        marginBottom: "var(--space-sm, 16px)",
      }}
    >
      <a href={creative.linkHref} style={{ color: "inherit", textDecoration: "none" }}>
        {creative.imageUrl ? (
          <img src={creative.imageUrl} alt={creative.headline} style={{ maxWidth: "100%", marginBottom: "var(--space-xs, 8px)" }} />
        ) : null}
        <h2 style={{ margin: 0, fontSize: "var(--font-size-heading-md, 1.5rem)" }}>{creative.headline}</h2>
        <p style={{ margin: "var(--space-xs, 8px) 0 0", fontSize: "var(--font-size-body, 1rem)" }}>{creative.body}</p>
      </a>
    </section>
  );
}

/**
 * componentType -> React component map -- the app-layer half of the CMS
 * contract (the CMS package only knows a section HAS a componentType +
 * config; turning that into real markup is the app's job, same
 * "concrete choices live in the app" pattern as theming's template map).
 * `pageSlug`/`serviceAreaId` are optional page-context props (additive to
 * the original `{ section }`-only signature) threaded in by call sites that
 * have that context, used only by the ad-slot case today.
 *
 * demo-routing-04/05: `demoSlug` is required (not optional) -- every call
 * site (campaign/[slug]/page.tsx, locations/[slug]/page.tsx,
 * app/demo/[demoSlug]/page.tsx) has a real one from its own route params,
 * so this component never has to guess/default one on its own.
 */
export async function CmsSection({
  demoSlug,
  section,
  pageSlug,
  serviceAreaId,
}: {
  demoSlug: DemoSlug;
  section: ComponentInstance;
  pageSlug?: string;
  serviceAreaId?: string;
}) {
  switch (section.componentType) {
    case "hero-banner":
      return <HeroBanner config={section.config} />;
    case "category-spot":
      return <CategorySpot demoSlug={demoSlug} config={section.config} />;
    case "product-grid":
      return <ProductGrid demoSlug={demoSlug} config={section.config} />;
    case "ad-slot":
      return <AdSlot demoSlug={demoSlug} pageSlug={pageSlug} serviceAreaId={serviceAreaId} />;
    case "service-area-info":
      return <ServiceAreaInfo config={section.config} />;
    default:
      return null;
  }
}
