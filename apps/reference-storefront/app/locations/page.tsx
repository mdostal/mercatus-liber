import Link from "next/link";
import { getServices } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function LocationsIndexPage() {
  const { serviceAreas } = await getServices();
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
