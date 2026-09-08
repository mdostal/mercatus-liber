import { getServices } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { search } = await getServices();
  const results = q ? await search.query({ text: q }) : [];

  return (
    <main>
      <h1>Search</h1>
      <form method="get" action="/search">
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
