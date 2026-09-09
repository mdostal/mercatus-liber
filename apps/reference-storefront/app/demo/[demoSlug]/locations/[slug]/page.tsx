import { notFound } from "next/navigation";
import { CmsSection } from "../../../../../components/cms-sections";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({ params }: { params: Promise<{ demoSlug: string; slug: string }> }) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { serviceAreas, catalog, cms } = await getServicesForDemo(demoSlug);

  const area = await serviceAreas.getServiceAreaBySlug(slug);
  if (!area) notFound();

  const productIds = await serviceAreas.listProductIdsInServiceArea(area.id);
  const products = (await Promise.all(productIds.map((id) => catalog.getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  // A CMS "location" page is optional -- richer authored content (hours,
  // testimonials) layers on top of the structured ServiceArea data, per
  // docs/subsystems/15-service-areas.md's data/layout split.
  const cmsPage = await cms.getPageBySlug(slug);
  const locationSections = cmsPage?.pageType === "location" ? cmsPage.sections : [];

  return (
    <main>
      <InteractionTracker eventName="location_viewed" properties={{ serviceAreaId: area.id, slug: area.slug }} />
      <h1>{area.name}</h1>
      <p>{area.description}</p>
      {area.phone && <p>Phone: {area.phone}</p>}

      {locationSections.map((section, i) => (
        <CmsSection key={i} section={section} pageSlug={slug} serviceAreaId={area.id} />
      ))}

      <h2>Available products</h2>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <a href={`/demo/${demoSlug}/products/${product.slug}`}>{product.title}</a>
          </li>
        ))}
        {products.length === 0 && <li>No products currently assigned to this location.</li>}
      </ul>
    </main>
  );
}
