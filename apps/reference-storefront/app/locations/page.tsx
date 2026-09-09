import Link from "next/link";
import { getServicesForDemo } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function LocationsIndexPage() {
  const { serviceAreas } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const areas = await serviceAreas.listServiceAreas();

  return (
    <main>
      <h1>Service Areas</h1>
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <Link href={`/locations/${area.slug}`}>{area.name}</Link> -- {area.region}
          </li>
        ))}
      </ul>
    </main>
  );
}
