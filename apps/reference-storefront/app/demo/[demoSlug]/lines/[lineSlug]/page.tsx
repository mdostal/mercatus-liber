import Link from "next/link";
import { notFound } from "next/navigation";
import { SaleWindow } from "@mercatus-liber/storefront-ui";
import { CategoryStandardGrid } from "../../../../../components/category-standard-grid";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../../lib/demos";
import { getLineForDemo } from "../../../../../lib/lines";
import { getServicesForDemo } from "../../../../../lib/services";
import { STORE_TIME_ZONE } from "../../../../../lib/store-time";

export const dynamic = "force-dynamic";

/**
 * A line's own landing page: its hero, where it is in its week (with a
 * countdown), and its products by section. Shown before any product exists,
 * so a line can be announced ahead of time.
 */
export default async function LinePage({ params }: { params: Promise<{ demoSlug: string; lineSlug: string }> }) {
  const { demoSlug, lineSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { catalog, media } = await getServicesForDemo(demoSlug);
  const renderedAt = new Date();
  const landing = await getLineForDemo(catalog, demoSlug, lineSlug, renderedAt);
  if (!landing) notFound();
  const { catalog: line, lifecycle, sections, otherProducts } = landing;
  const productCount = sections.reduce((n, s) => n + s.products.length, 0) + otherProducts.length;
  return (
    <main>
      <InteractionTracker eventName="catalog_viewed" properties={{ catalogId: line.id, slug: line.slug, kind: "sales" }} />
      <p>
        <Link href={`/demo/${demoSlug}/lines`}>← All lines</Link>
      </p>
      <header style={{ display: "grid", gap: 8, marginBottom: "var(--space-md, 32px)" }}>
        {line.hero?.imageUrl ? <img src={line.hero.imageUrl} alt={line.hero.imageAlt ?? ""} style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: "var(--radius)" }} /> : null}
        <h1 style={{ margin: 0 }}>{line.hero?.title ?? line.name}</h1>
        {line.hero?.subtitle ? <p style={{ margin: 0, fontSize: "1.1rem" }}>{line.hero.subtitle}</p> : null}
        {line.description ? <p style={{ margin: 0, maxWidth: "65ch" }}>{line.description}</p> : null}
        <SaleWindow lifecycle={lifecycle} now={renderedAt.toISOString()} timeZone={STORE_TIME_ZONE} />
        {line.hero?.cta ? (
          <p style={{ margin: 0 }}>
            <Link href={line.hero.cta.href}>{line.hero.cta.label}</Link>
          </p>
        ) : null}
      </header>
      {productCount > 0 ? (
        <form method="get" action={`/demo/${demoSlug}/search`} role="search" style={{ marginBottom: "var(--space-md, 32px)" }}>
          <input type="hidden" name="line" value={line.slug} />
          <input type="search" name="q" aria-label={`Search ${line.hero?.title ?? line.name}`} placeholder={`Search ${line.hero?.title ?? line.name}...`} />
          <button type="submit">Search</button>
        </form>
      ) : null}
      {productCount === 0 ? <p>The pieces in this line are coming soon.</p> : null}
      {sections.map((section) =>
        section.products.length > 0 ? (
          <section key={section.slug} id={section.slug} data-section={section.slug}>
            <h2>{section.title}</h2>
            <CategoryStandardGrid demoSlug={demoSlug} products={section.products} media={media} />
          </section>
        ) : null,
      )}
      {otherProducts.length > 0 ? (
        <section data-section="more">
          {sections.length > 0 ? <h2>More</h2> : null}
          <CategoryStandardGrid demoSlug={demoSlug} products={otherProducts} media={media} />
        </section>
      ) : null}
    </main>
  );
}
