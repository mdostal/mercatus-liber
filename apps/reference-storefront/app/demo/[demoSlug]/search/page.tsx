import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InteractionTracker } from "../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";
import { canonicalUrl } from "../../../../lib/site-url";

export const dynamic = "force-dynamic";

/**
 * seo-01: query-aware metadata -- title reflects the real query string when
 * present (e.g. "Search: camera | Northline Home Tech", via the demo
 * layout's title.template), a sane demo-name default when absent (falls
 * through to the layout's own `title.default`, so no title is set here at
 * all in the no-query case). Canonical intentionally omits the `q` search
 * param -- `/demo/<slug>/search` is the one real canonical URL for the
 * search feature itself; a specific query string is a filtered view of it,
 * not a distinct indexable page (standard SEO practice for faceted/search
 * result URLs, avoids splitting ranking signal across infinite query-string
 * variants of the same page).
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const { q } = await searchParams;
  const path = `/demo/${demoSlug}/search`;
  const canonical = canonicalUrl(path);

  if (!q) {
    return { alternates: { canonical } };
  }

  return {
    title: `Search: ${q}`,
    alternates: { canonical },
  };
}

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
