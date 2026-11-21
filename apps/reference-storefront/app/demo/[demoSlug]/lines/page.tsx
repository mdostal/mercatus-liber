import Link from "next/link";
import { notFound } from "next/navigation";
import { SaleWindow } from "@mercatus-liber/storefront-ui";
import { isDemoSlug } from "../../../../lib/demos";
import { listLinesForDemo } from "../../../../lib/lines";
import { getServicesForDemo } from "../../../../lib/services";
import { STORE_TIME_ZONE } from "../../../../lib/store-time";

export const dynamic = "force-dynamic";

export default async function LinesPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { catalog } = await getServicesForDemo(demoSlug);
  const renderedAt = new Date();
  const lines = await listLinesForDemo(catalog, demoSlug, renderedAt);
  return (
    <main>
      <h1>Lines</h1>
      {lines.length === 0 ? <p>No lines yet.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-sm, 16px)", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }}>
        {lines.map(({ line, lifecycle }) => (
          <li key={line.id} data-line={line.slug} style={{ border: "1px solid var(--color-border, #ddd)", borderRadius: "var(--radius)", padding: "var(--space-sm, 16px)", display: "grid", gap: 8 }}>
            {line.hero?.imageUrl ? <img src={line.hero.imageUrl} alt={line.hero.imageAlt ?? ""} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "var(--radius)" }} /> : null}
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
              <Link href={`/demo/${demoSlug}/lines/${line.slug}`}>{line.hero?.title ?? line.name}</Link>
            </h2>
            {line.hero?.subtitle ? <p style={{ margin: 0 }}>{line.hero.subtitle}</p> : null}
            <SaleWindow lifecycle={lifecycle} now={renderedAt.toISOString()} timeZone={STORE_TIME_ZONE} />
          </li>
        ))}
      </ul>
    </main>
  );
}
