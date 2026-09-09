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
    <main>
      {q && <InteractionTracker eventName="search_performed" properties={{ query: q, resultCount: results.length }} />}
      <h1>Search</h1>
      <form method="get" action={`/demo/${demoSlug}/search`}>
        <input type="text" name="q" defaultValue={q ?? ""} placeholder="Search products..." />
        <button type="submit">Search</button>
      </form>
      {q && (
        <ul>
          {results.map((doc) => (
            <li key={doc.id}>{doc.title}</li>
          ))}
          {results.length === 0 && <li>No results for &quot;{q}&quot;.</li>}
        </ul>
      )}
    </main>
  );
}
