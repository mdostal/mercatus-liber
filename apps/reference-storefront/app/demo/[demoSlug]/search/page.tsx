import { notFound } from "next/navigation";
import { InteractionTracker } from "../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { q } = await searchParams;
  const { search } = await getServicesForDemo(demoSlug);
  const results = q ? await search.query({ text: q }) : [];

  return (
    <main style={{ padding: "var(--space-sm, 16px)" }}>
      {q && <InteractionTracker eventName="search_performed" properties={{ query: q, resultCount: results.length }} />}
      <h1 style={{ fontSize: "var(--font-size-heading-lg, 2.5rem)" }}>Search</h1>
      <form method="get" action={`/demo/${demoSlug}/search`} style={{ marginBottom: "var(--space-md, 32px)" }}>
        <input type="text" name="q" defaultValue={q ?? ""} placeholder="Search products..." />
        <button type="submit">Search</button>
      </form>
      {q && (
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-sm, 16px)",
            listStyle: "none",
            padding: 0,
          }}
        >
          {results.map((doc) => (
            <li
              key={doc.id}
              style={{
                border: "1px solid var(--color-border, #ddd)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-card, none)",
                padding: "var(--space-sm, 16px)",
                fontSize: "var(--font-size-body, 1rem)",
              }}
            >
              {doc.title}
            </li>
          ))}
          {results.length === 0 && (
            <li style={{ color: "var(--color-muted, #666)", fontSize: "var(--font-size-body, 1rem)" }}>
              No results for &quot;{q}&quot;.
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
