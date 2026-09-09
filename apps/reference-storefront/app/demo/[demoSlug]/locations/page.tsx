import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function LocationsIndexPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { serviceAreas } = await getServicesForDemo(demoSlug);
  const areas = await serviceAreas.listServiceAreas();

  return (
    <main>
      <h1>Service Areas</h1>
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <Link href={`/demo/${demoSlug}/locations/${area.slug}`}>{area.name}</Link> -- {area.region}
          </li>
        ))}
      </ul>
    </main>
  );
}
