/**
 * seo-02: minimal JSON-LD rendering helper, following Next.js's own
 * documented pattern (node_modules/next/dist/docs/01-app/02-guides/
 * json-ld.md) -- a real `<script type="application/ld+json">` tag rendered
 * from a Server Component, no schema-dts or other structured-data package
 * needed (the story spec explicitly says not to assume one is required).
 * `<` is escaped to its unicode equivalent (`<`) exactly as that guide
 * recommends, since `JSON.stringify` alone doesn't stop a real product/page
 * title containing `</script>`-shaped text from breaking out of the tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** A real schema.org BreadcrumbList object built from real page hierarchy (Home -> Category -> Product), never invented labels. */
export function breadcrumbList(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
