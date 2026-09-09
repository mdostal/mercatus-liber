import type { ComponentInstance } from "@mercatus-liber/cms";
import { getServicesForDemo } from "../lib/services";

async function HeroBanner({ config }: { config: Record<string, unknown> }) {
  return (
    <section style={{ padding: 24, background: "#222", color: "#fff", marginBottom: 16 }}>
      <h1 style={{ margin: 0 }}>{String(config.headline ?? "")}</h1>
      {config.subheadline ? <p style={{ margin: "8px 0 0" }}>{String(config.subheadline)}</p> : null}
    </section>
  );
}

async function CategorySpot({ config }: { config: Record<string, unknown> }) {
  const { marketingCatalog } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const slugs = Array.isArray(config.categorySlugs) ? (config.categorySlugs as string[]) : [];
  const categories = (await Promise.all(slugs.map((slug) => marketingCatalog.getCategoryBySlug(slug)))).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  return (
    <section style={{ marginBottom: 16 }}>
      <h2>Shop by category</h2>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            <a href={`/category/${category.slug}`}>{category.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ProductGrid({ config }: { config: Record<string, unknown> }) {
  const { catalog } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const productIds = Array.isArray(config.productIds) ? (config.productIds as string[]) : [];
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  return (
    <section>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/products/${product.slug}`}>{product.title}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ServiceAreaInfo({ config }: { config: Record<string, unknown> }) {
  return (
    <section style={{ marginBottom: 16 }}>
      {config.hours ? (
        <p>
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
async function AdSlot({ pageSlug, serviceAreaId }: { pageSlug?: string; serviceAreaId?: string }) {
  const { advertising } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const result = await advertising.getActiveCreativeForSlot({ pageSlug, serviceAreaId });
  if (!result) return null;

  const { creative } = result;
  return (
    <section style={{ padding: 24, background: "#f5f5f5", border: "1px solid #ddd", marginBottom: 16 }}>
      <a href={creative.linkHref} style={{ color: "inherit", textDecoration: "none" }}>
        {creative.imageUrl ? (
          <img src={creative.imageUrl} alt={creative.headline} style={{ maxWidth: "100%", marginBottom: 8 }} />
        ) : null}
        <h2 style={{ margin: 0 }}>{creative.headline}</h2>
        <p style={{ margin: "8px 0 0" }}>{creative.body}</p>
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
 */
export async function CmsSection({
  section,
  pageSlug,
  serviceAreaId,
}: {
  section: ComponentInstance;
  pageSlug?: string;
  serviceAreaId?: string;
}) {
  switch (section.componentType) {
    case "hero-banner":
      return <HeroBanner config={section.config} />;
    case "category-spot":
      return <CategorySpot config={section.config} />;
    case "product-grid":
      return <ProductGrid config={section.config} />;
    case "ad-slot":
      return <AdSlot pageSlug={pageSlug} serviceAreaId={serviceAreaId} />;
    case "service-area-info":
      return <ServiceAreaInfo config={section.config} />;
    default:
      return null;
  }
}
