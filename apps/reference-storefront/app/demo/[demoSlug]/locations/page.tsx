import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function LocationsIndexPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { serviceAreas } = await getServicesForDemo(demoSlug);
  // commerce-gap-audit-3: scoped to this demo's own service areas -- before
  // this fix, this page listed every demo's cities combined (see
  // ServiceArea.demoSlug's doc comment).
  const areas = await serviceAreas.listServiceAreas({ demoSlug });

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
