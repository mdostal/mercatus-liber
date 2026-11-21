import Link from "next/link";
import { notFound } from "next/navigation";
import { LineFormFields } from "../../../../../../components/line-form";
import { DEMO_CATALOG_SLUG, isDemoSlug } from "../../../../../../lib/demos";
import { applyLineWindowAction, updateLineAction } from "../../../../../../lib/line-actions";
import { formatSectionsText } from "../../../../../../lib/lines";
import { getServicesForDemo } from "../../../../../../lib/services";
import { STORE_TIME_ZONE } from "../../../../../../lib/store-time";

export const dynamic = "force-dynamic";

export default async function AdminLinePage({ params }: { params: Promise<{ demoSlug: string; lineId: string }> }) {
  const { demoSlug, lineId } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { catalog } = await getServicesForDemo(demoSlug);
  const [master, line] = await Promise.all([catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]), catalog.getCatalog(lineId)]);
  if (!master || !line || line.kind !== "sales" || line.masterCatalogId !== master.id) notFound();
  const slugOf = async (id: string) => (await catalog.getProduct(id))?.slug ?? id;
  const sections = await Promise.all((line.sections ?? []).map(async (s) => ({ slug: s.slug, title: s.title, productSlugs: await Promise.all(s.productIds.map(slugOf)) })));
  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/lines`}>← Lines</Link> · <Link href={`/demo/${demoSlug}/lines/${line.slug}`}>View the page</Link>
      </p>
      <h1>{line.name}</h1>
      <form action={updateLineAction}>
        <LineFormFields demoSlug={demoSlug} line={line} sectionsText={formatSectionsText(sections)} timeZone={STORE_TIME_ZONE} />
        <button type="submit">Save</button>
      </form>
      <h2>Products' sale windows</h2>
      <p style={{ maxWidth: "65ch" }}>
        Give this line's products a sale window covering every line they're in. After the window closes they can't be bought until another line includes them or their own window is cleared.
      </p>
      <form action={applyLineWindowAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="id" value={line.id} />
        <button type="submit">Apply the line's window to its products</button>
      </form>
    </main>
  );
}
