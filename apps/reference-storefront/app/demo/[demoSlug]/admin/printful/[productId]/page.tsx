import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogItemDetail } from "@mercatus-liber/admin-ui";
import { isDemoSlug } from "../../../../../../lib/demos";
import { printfulInStore, printfulProductDetail } from "../../../../../../lib/printful-admin";
import { getServicesForDemo } from "../../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function PrintfulProductPage({ params }: { params: Promise<{ demoSlug: string; productId: string }> }) {
  const { demoSlug, productId } = await params;
  if (!isDemoSlug(demoSlug) || !/^\d+$/.test(productId)) notFound();
  const services = await getServicesForDemo(demoSlug);
  const adminBase = `/demo/${demoSlug}/admin`;
  const [detail, inStore] = await Promise.all([printfulProductDetail(services, Number(productId)), printfulInStore(services, demoSlug)]);
  if (!detail) notFound();
  const { listing } = detail;
  const storeProducts = inStore.get(listing.id) ?? [];

  return (
    <main>
      <p>
        <Link href={`${adminBase}/printful`}>← Printful catalog</Link>
      </p>
      <CatalogItemDetail
        name={listing.name}
        subtitle={`${[listing.brand, listing.model].filter(Boolean).join(" ") || listing.type} · Printful product ${listing.id}`}
        imageUrl={listing.image}
        description={listing.description}
        colors={listing.colors.map((c) => ({ name: c.name, hex: c.value }))}
        sizes={listing.sizes}
        cells={detail.cells}
        printAreas={detail.printAreas}
        links={storeProducts.map((p) => ({ label: `In this store: ${p.title}`, href: `${adminBase}/products/${p.id}/skus` }))}
        notice={
          detail.live
            ? "Costs are Printful's list price for the default technique with one print area, before shipping. Hover a cell for stock by region."
            : "This is a saved copy of Printful's listing. Costs, stock and print-area sizes need PRINTFUL_API_TOKEN."
        }
      />
    </main>
  );
}
