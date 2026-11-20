import Link from "next/link";
import { notFound } from "next/navigation";
import { printfulReadiness } from "@mercatus-liber/adapter-printful";
import { BringOverForm, CatalogItemDetail } from "@mercatus-liber/admin-ui";
import { isDemoSlug } from "../../../../../../lib/demos";
import { bringOverPrintfulAction, planPrintfulBringOverAction, publishPrintfulProductAction } from "../../../../../../lib/printful-actions";
import { placementLabel, printfulInStore, printfulProductDetail } from "../../../../../../lib/printful-admin";
import { getServicesForDemo } from "../../../../../../lib/services";

export const dynamic = "force-dynamic";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default async function PrintfulProductPage({ params }: { params: Promise<{ demoSlug: string; productId: string }> }) {
  const { demoSlug, productId } = await params;
  if (!isDemoSlug(demoSlug) || !/^\d+$/.test(productId)) notFound();
  const services = await getServicesForDemo(demoSlug);
  const adminBase = `/demo/${demoSlug}/admin`;
  const printfulId = Number(productId);
  const [detail, inStore] = await Promise.all([printfulProductDetail(services, printfulId), printfulInStore(services, demoSlug)]);
  if (!detail) notFound();
  const { listing } = detail;
  const storeProducts = inStore.get(listing.id) ?? [];
  const client = services.printfulCatalog;
  const readiness = await Promise.all(
    storeProducts.map(async (p) => ({
      product: p,
      readiness: await printfulReadiness({ catalog: services.catalog, mappings: services.providerCatalogMappings, ...(client ? { prices: (id: number) => client.getPrices(id) } : {}) }, p.id),
    })),
  );
  const placements = (detail.areas.length ? detail.areas : listing.placements.map((p) => ({ placement: p.placement, technique: p.technique, displayName: "", widthPx: 0, heightPx: 0 }))).map((a) => ({
    key: a.placement,
    label: a.displayName || placementLabel(a.placement),
    technique: a.technique,
    ...(a.widthPx ? { size: `${a.widthPx} × ${a.heightPx} px` } : {}),
  }));
  const uniquePlacements = placements.filter((p, i) => placements.findIndex((q) => q.key === p.key && q.technique === p.technique) === i);

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
      >
        {readiness.length > 0 && (
          <section id="in-store" style={{ display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>In this store</h3>
            {readiness.map(({ product, readiness: r }) => (
              <div key={product.id} data-store-product={product.id} style={{ border: "1px solid var(--color-border, #ccc)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                <p style={{ margin: 0 }}>
                  <b>{product.title}</b> · {product.status === "active" ? "On sale" : "Not published"} · <Link href={`${adminBase}/products/${product.id}/skus`}>SKUs</Link> · <Link href={`${adminBase}/printful/${printfulId}/place?product=${product.id}`}>Art and placement</Link>
                </p>
                {r.problems.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {r.problems.map((p) => (
                      <li key={p.code}>{p.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 13 }}>Ready to sell.</p>
                )}
                <details>
                  <summary style={{ fontSize: 13 }}>{r.skus.length} SKUs with cost and margin</summary>
                  <table style={{ fontSize: 12, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                    <tbody>
                      {r.skus.map((s) => (
                        <tr key={s.skuId}>
                          <td style={{ padding: "2px 8px" }}>{s.label}</td>
                          <td style={{ padding: "2px 8px" }}>{money(s.priceCents)}</td>
                          <td style={{ padding: "2px 8px" }}>{s.costCents !== null ? `cost ${money(s.costCents)}` : "cost unknown"}</td>
                          <td style={{ padding: "2px 8px" }}>{s.hasArt ? "art set" : "no art"}</td>
                          <td style={{ padding: "2px 8px" }}>{s.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
                {product.status !== "active" && (
                  <form action={publishPrintfulProductAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="printfulProductId" value={printfulId} />
                    <button type="submit" disabled={!r.ready}>
                      Publish
                    </button>
                  </form>
                )}
              </div>
            ))}
          </section>
        )}
        <BringOverForm
          colors={listing.colors.map((c) => ({ name: c.name, hex: c.value }))}
          sizes={listing.sizes}
          techniques={listing.techniques.map((t) => ({ key: t.key, label: t.display_name }))}
          placements={uniquePlacements}
          defaults={{ title: listing.name, technique: listing.techniques.find((t) => t.is_default)?.key ?? listing.techniques[0]?.key ?? "", description: listing.description }}
          onPlan={planPrintfulBringOverAction.bind(null, demoSlug, printfulId)}
          onSubmit={bringOverPrintfulAction.bind(null, demoSlug, printfulId)}
          {...(client ? {} : { disabledReason: "Bringing a product over needs PRINTFUL_API_TOKEN: the saved catalog has no variant ids or prices." })}
        />
      </CatalogItemDetail>
    </main>
  );
}
