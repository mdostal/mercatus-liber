import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogGrid } from "@mercatus-liber/admin-ui";
import { isDemoSlug } from "../../../../../lib/demos";
import { isLivePrintful, printfulCatalogCache, printfulFacets, printfulGridItems, printfulInStore, snapshotCaption } from "../../../../../lib/printful-admin";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function PrintfulCatalogPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const services = await getServicesForDemo(demoSlug);
  const adminBase = `/demo/${demoSlug}/admin`;
  const [snapshot, inStore] = await Promise.all([printfulCatalogCache(services).get(), printfulInStore(services, demoSlug)]);

  return (
    <main>
      <p>
        <Link href={adminBase}>← Admin</Link>
      </p>
      <h1>Printful catalog</h1>
      <p style={{ maxWidth: "65ch" }}>Everything Printful can make. Open a product to see its colours, sizes, costs and print areas, and bring it into this store.</p>
      <CatalogGrid items={printfulGridItems(snapshot, inStore, adminBase)} facets={printfulFacets(snapshot)} caption={snapshotCaption(snapshot, isLivePrintful(services))} />
    </main>
  );
}
