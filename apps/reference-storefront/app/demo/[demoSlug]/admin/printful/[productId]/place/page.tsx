import Link from "next/link";
import { notFound } from "next/navigation";
import { templateFor, type PrintfulCatalogTarget } from "@mercatus-liber/adapter-printful";
import { MockupGallery, PlacementArtEditor } from "@mercatus-liber/admin-ui";
import { layoutsFromPrintAreas } from "@mercatus-liber/print-art";
import { isDemoSlug, listProductsForDemo } from "../../../../../../../lib/demos";
import { printfulMockupStatusAction, removePrintfulArtAction, requestPrintfulMockupsAction, savePrintfulArtAction, savePrintfulMockupsAction, uploadPrintfulArtAction } from "../../../../../../../lib/printful-actions";
import { cachedPrintful, placementLabel } from "../../../../../../../lib/printful-admin";
import { getServicesForDemo } from "../../../../../../../lib/services";

export const dynamic = "force-dynamic";

/**
 * Art for each print area of a store product made from Printful: the art on
 * Printful's own template for one colour, its fit, and a field to change it.
 * Saving sets that placement's file on every SKU of the product.
 */
export default async function PrintfulPlacementPage({ params, searchParams }: { params: Promise<{ demoSlug: string; productId: string }>; searchParams: Promise<{ product?: string; variant?: string }> }) {
  const { demoSlug, productId } = await params;
  const { product: storeProductId = "", variant } = await searchParams;
  if (!isDemoSlug(demoSlug) || !/^\d+$/.test(productId)) notFound();
  const services = await getServicesForDemo(demoSlug);
  const adminBase = `/demo/${demoSlug}/admin`;
  const printfulId = Number(productId);
  const product = (await listProductsForDemo(services.catalog, demoSlug)).find((p) => p.id === storeProductId);
  if (!product) notFound();
  const back = (
    <p>
      <Link href={`${adminBase}/printful/${printfulId}#in-store`}>← {product.title}</Link>
    </p>
  );
  const client = services.printfulCatalog;
  if (!client) {
    return (
      <main>
        {back}
        <h1>Art and placement</h1>
        <p>Printful's templates and print areas need PRINTFUL_API_TOKEN.</p>
      </main>
    );
  }

  const skus = await services.catalog.listSkusByProduct(product.id);
  const targets = (await Promise.all(skus.map(async (s) => ({ sku: s, target: (await services.providerCatalogMappings.get(s.id, "printful"))?.target as PrintfulCatalogTarget | undefined })))).filter((t) => t.target);
  const [listing, areas, variants] = await Promise.all([
    cachedPrintful(`listing:${printfulId}`, () => client.getCatalogListing(printfulId)),
    cachedPrintful(`areas:${printfulId}`, () => client.getPrintAreas(printfulId)),
    cachedPrintful(`variants:${printfulId}`, () => client.listVariants(printfulId)),
  ]);
  const current = targets[0]?.target?.placements ?? [];
  const technique = current[0]?.technique ?? listing?.techniques.find((t) => t.is_default)?.key ?? areas[0]?.technique ?? "";
  // Only this technique's placements: a tee has 2,158 templates in all.
  const placementKeys = [...new Set(areas.filter((a) => a.technique === technique).map((a) => a.placement))].sort();
  const templates = await cachedPrintful(`templates:${printfulId}:${placementKeys.join(",")}`, () => client.getMockupTemplates(printfulId, { placements: placementKeys }));
  const productVariantIds = new Set(targets.map((t) => t.target!.catalogVariantId));
  const colours = [...new Map(variants.filter((v) => productVariantIds.has(v.id)).map((v) => [v.color, v])).values()];
  const chosen = colours.find((v) => String(v.id) === variant) ?? colours[0];
  const layouts = layoutsFromPrintAreas(
    areas.map((a) => ({ key: a.placement, widthInches: a.widthInches, heightInches: a.heightInches, dpi: a.dpi, technique: a.technique })),
    { technique },
  );
  const artFor = (placement: string) => current.find((p) => p.placement === placement)?.layers[0]?.url;

  return (
    <main>
      {back}
      <h1>Art and placement</h1>
      <p style={{ maxWidth: "65ch" }}>
        {product.title}, made with {listing?.techniques.find((t) => t.key === technique)?.display_name ?? technique}. Each print file should be the size shown, as a PNG Printful can download from a public https URL. Saving sets it on all {skus.length} SKUs.
      </p>
      {colours.length > 1 && (
        <p style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
          Preview on:
          {colours.map((v) => (
            <Link key={v.id} href={`?product=${product.id}&variant=${v.id}`} aria-current={v.id === chosen?.id ? "true" : undefined} style={{ fontWeight: v.id === chosen?.id ? 700 : 400 }}>
              {v.color}
            </Link>
          ))}
        </p>
      )}
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
        {Object.values(layouts).map((layout) => {
          const template = chosen ? templateFor(templates, chosen.id, layout.placement) : null;
          const url = artFor(layout.placement);
          return (
            <section key={layout.id} data-placement={layout.placement} style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>{areas.find((a) => a.placement === layout.placement)?.displayName || placementLabel(layout.placement)}</h2>
              {template ? (
                <PlacementArtEditor
                  template={template}
                  label={`${placementLabel(layout.placement)} on ${chosen!.color}`}
                  printAreaPx={{ width: layout.px[0], height: layout.px[1] }}
                  {...(url ? { artUrl: url } : {})}
                  onSave={savePrintfulArtAction.bind(null, demoSlug, product.id, layout.placement, technique)}
                  onRemove={removePrintfulArtAction.bind(null, demoSlug, product.id, layout.placement)}
                  onUpload={uploadPrintfulArtAction.bind(null, demoSlug, product.id, layout.placement, technique)}
                />
              ) : (
                <p style={{ fontSize: 13 }}>
                  Printful has no template for this placement on {chosen?.color ?? "this product"}. Print file: {layout.px[0]} × {layout.px[1]} px. {url ? `Art: ${url}` : "No art yet."}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>Mockups</h2>
      <p style={{ maxWidth: "65ch", fontSize: 14 }}>
        Printful draws the product with its current art. Its image links last only a while, so the ones you keep are copied into this store. A new Printful store can ask for 2 mockups a minute.
      </p>
      <MockupGallery
        variants={colours.map((v) => ({ id: String(v.id), label: v.color, ...(v.color_code ? { swatch: v.color_code } : {}) }))}
        current={product.images ?? []}
        onRequest={requestPrintfulMockupsAction.bind(null, demoSlug, product.id)}
        onPoll={printfulMockupStatusAction.bind(null, demoSlug, product.id)}
        onSave={savePrintfulMockupsAction.bind(null, demoSlug, product.id)}
      />
    </main>
  );
}
