import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { TierPricing } from "@mercatus-liber/bundles";
import { PdpLongScroll } from "../../../../../components/pdp-long-scroll";
import { PdpSpecSheet } from "../../../../../components/pdp-spec-sheet";
import { PdpTabbedDetail } from "../../../../../components/pdp-tabbed-detail";
import { BundleTierSelector } from "../../../../../components/bundle-tier-selector";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { RecommendationShelf, resolvePdpRecommendations } from "../../../../../components/recommendation-shelf";
import { isDemoSlug } from "../../../../../lib/demos";
import { breadcrumbList, JsonLd, type BreadcrumbItem } from "../../../../../lib/json-ld";
import { isCustomizableProduct } from "../../../../../lib/seed";
import { getServicesForDemo } from "../../../../../lib/services";
import { canonicalUrl } from "../../../../../lib/site-url";
import { readActiveThemeBundle } from "../../../../../lib/theme-cookie";
import { resolveProductImageAlt, resolveProductImageUrl } from "../../../../../lib/product-image";

export const dynamic = "force-dynamic";

/** A description longer than this gets truncated at a word boundary for the <meta name="description"> tag -- Google's own snippet length guidance is ~155-160 chars; 160 gives a little headroom before the ellipsis. */
const DESCRIPTION_MAX_LENGTH = 160;

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  const truncated = text.slice(0, DESCRIPTION_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : DESCRIPTION_MAX_LENGTH)}...`;
}

/**
 * seo-02: builds the real schema.org `offers` value for a PDP's Product
 * JSON-LD, reusing the exact `viewModel.skus`/`stockBySkuId` data already
 * computed by ProductPage below (no redundant fetch) -- a single real
 * `Offer` for a single-SKU product (the common case), a real `AggregateOffer`
 * (low/high price across the product's own real SKUs) when it has more than
 * one, matching schema.org's own guidance for a variant product. Returns
 * undefined for the (unexpected) zero-SKU case rather than emitting a
 * fabricated price.
 */
function buildProductOffers(
  skus: { id: string; price: { amount: number; currency: string } }[],
  stockBySkuId: Record<string, number | null>,
  url: string,
): Record<string, unknown> | undefined {
  if (skus.length === 0) return undefined;

  const currency = skus[0]!.price.currency;
  const amounts = skus.map((sku) => sku.price.amount);
  // A `null` entry means no StockLevel record exists at all -- this SKU is
  // not inventory-tracked (e.g. a bookable service, per
  // docs/subsystems/11-inventory.md's "no stock record" convention), never
  // "confirmed zero." Only a real, tracked non-positive quantity counts as
  // out of stock; untracked SKUs are always treated as available.
  const anyInStock = skus.some((sku) => {
    const level = stockBySkuId[sku.id];
    return level === null || level === undefined || level > 0;
  });
  const availability = anyInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  if (skus.length === 1) {
    return {
      "@type": "Offer",
      priceCurrency: currency,
      price: (amounts[0]! / 100).toFixed(2),
      availability,
      url,
    };
  }

  return {
    "@type": "AggregateOffer",
    priceCurrency: currency,
    lowPrice: (Math.min(...amounts) / 100).toFixed(2),
    highPrice: (Math.max(...amounts) / 100).toFixed(2),
    offerCount: skus.length,
    availability,
  };
}

/**
 * seo-01: real per-product metadata -- title is the exact real product
 * title (rendered through the demo layout's `%s | <demo displayName>`
 * template, so the tab reads e.g. "Embroidered Dad Cap | The Print Shop"),
 * description is the real product description (truncated sensibly per the
 * acceptance criteria, since some seeded product descriptions run long).
 * Calls pdp.getViewModel(slug) directly (no templateOverride -- metadata
 * never needs a rendering template, only the real product/skus) rather than
 * threading the page's own already-resolved viewModel through, since
 * generateMetadata and the page component run as two separate entry points
 * with no shared closure; Next.js memoizes identical `fetch` calls across
 * them, and the underlying catalog reads here are cheap in-memory/SQLite
 * lookups, not a duplicate network round trip.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ demoSlug: string; slug: string }>;
}): Promise<Metadata> {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const { pdp } = await getServicesForDemo(demoSlug);
  const viewModel = await pdp.getViewModel(slug);
  if (!viewModel) return {};

  const { product } = viewModel;
  const path = `/demo/${demoSlug}/products/${product.slug}`;

  return {
    title: product.title,
    description: truncateDescription(product.description),
    alternates: { canonical: canonicalUrl(path) },
  };
}

/**
 * Template-key -> component map, the app-layer half of the theming contract
 * (theming resolves WHICH key; this map decides what that key renders as).
 * Adding a new registered template requires one more entry here.
 */
const TEMPLATE_COMPONENTS = {
  "pdp.tabbed-detail": PdpTabbedDetail,
  "pdp.long-scroll": PdpLongScroll,
  "pdp.spec-sheet": PdpSpecSheet,
} as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string; slug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { template } = await searchParams;
  const { pdp, inventory, bundles, recommendations, catalog, marketingCatalog, media, reviews } = await getServicesForDemo(demoSlug);

  // Explicit ?template= always wins; otherwise fall back to the active
  // theme's PDP choice (a per-request, per-call override -- never mutates
  // the shared theming singleton, so concurrent requests with different
  // themes never race each other). Only pdp's own internal default (theming
  // .resolveTemplate) is used if neither is provided.
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const templateOverride = template ?? activeTheme.defaultTemplatesByPageType.pdp;

  const viewModel = await pdp.getViewModel(slug, templateOverride);
  if (!viewModel) notFound();

  // Stock is deliberately NOT part of pdp's view model (see pt-02's design
  // decision -- no inventory epic existed yet); composed here at the app
  // layer instead, same "app composes multiple services" pattern as
  // everything else in this reference storefront.
  // `null` means "not inventory-tracked" (e.g. Northline's bookable
  // services -- no StockLevel record exists for them by design, see
  // docs/subsystems/11-inventory.md), distinct from a real tracked quantity
  // of 0. Collapsing both to 0 was a real bug: it showed "in stock: 0" and
  // emitted schema.org OutOfStock for services that are always bookable.
  const stockBySkuId: Record<string, number | null> = {};
  for (const sku of viewModel.skus) {
    const level = await inventory.getStock(sku.id);
    stockBySkuId[sku.id] = level ? level.onHand - level.reserved : null;
  }

  // Bundles is deliberately NOT part of pdp's view model, same "app composes
  // multiple services" pattern as stock above -- see design-discussion.md §5,
  // which resolves docs/subsystems/04-pdp.md's open question 1 this way for
  // v1 rather than folding bundle data into PdpViewModel itself. When a
  // product has no attached bundle, this is a no-op and the page renders
  // exactly as it did before this story.
  const bundle = await bundles.getBundleForProduct(viewModel.product.id);
  const pricingByTierId: Record<string, TierPricing> = {};
  if (bundle) {
    for (const tier of bundle.tiers) {
      const pricing = await bundles.computeTierPricing(bundle.id, tier.id);
      if (pricing) pricingByTierId[tier.id] = pricing;
    }
  }

  const Component =
    (viewModel.templateKey && TEMPLATE_COMPONENTS[viewModel.templateKey as keyof typeof TEMPLATE_COMPONENTS]) ||
    PdpTabbedDetail;

  // image-cdn epic: resolves to null (never a fabricated placeholder URL)
  // when this product has no `images` yet -- see lib/product-image.ts's own
  // doc comment. Every PDP template below treats a null imageUrl as
  // "render nothing extra," so this is a safe no-op ahead of seed data
  // actually carrying real photos.
  const imageUrl = resolveProductImageUrl(media, viewModel.product, { width: 1000, height: 1000, fit: "cover" });
  const imageAlt = resolveProductImageAlt(viewModel.product);

  // Recommendations is deliberately NOT part of pdp's view model, same
  // "app composes multiple services" pattern as stock/bundles above -- see
  // design-discussion.md §3 (upsell-cross-sell). Curated rule first, falling
  // back to the same-category heuristic, or nothing at all when neither
  // yields a product -- this call is a no-op for a product with no attached
  // recommendation data, matching this story's zero-regression requirement.
  const recommendationShelf = await resolvePdpRecommendations(
    { recommendations, catalog, marketingCatalog, media },
    viewModel.product.id,
  );

  // bare-basics epic: reviews is deliberately NOT part of pdp's view model,
  // same "app composes multiple services" pattern as stock/bundles/
  // recommendations above. getRatingSummary is always computed fresh (never
  // cached/stale -- see ReviewsService.getRatingSummary's own doc comment)
  // and returns a real zero-count summary for an unreviewed product, never
  // undefined -- every PDP template below only renders the rating line when
  // `ratingSummary.count > 0`.
  const ratingSummary = await reviews.getRatingSummary(viewModel.product.id);
  const publishedReviews = await reviews.listPublishedReviewsForProduct(viewModel.product.id);

  // seo-02: real Product + BreadcrumbList JSON-LD, built from data already
  // resolved above (viewModel, stockBySkuId) plus one real new lookup this
  // page didn't previously make (the product's real assigned category, for
  // the breadcrumb's middle hop) -- never invented labels/prices.
  const productPath = `/demo/${demoSlug}/products/${viewModel.product.slug}`;
  const productUrl = canonicalUrl(productPath);
  const offers = buildProductOffers(viewModel.skus, stockBySkuId, productUrl);
  // image-cdn epic: schema.org's real convention for a Product's photos is
  // an `image` field holding an array of URLs -- every real photo this
  // product has (not just the primary one), each resolved through the same
  // media adapter as the on-page <img>. Omitted entirely (not an empty
  // array) when the product has no `images` at all, same "never fabricate"
  // discipline as buildProductOffers above.
  const productImages = viewModel.product.images
    ?.map((image) => resolveProductImageUrl(media, { images: [image] }))
    .filter((url): url is string => url !== null);
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: viewModel.product.title,
    description: viewModel.product.description,
    url: productUrl,
    ...(offers ? { offers } : {}),
    ...(productImages && productImages.length > 0 ? { image: productImages } : {}),
    // bare-basics epic: schema.org's real, documented AggregateRating shape
    // (https://schema.org/AggregateRating) -- only ever emitted when this
    // product has at least one real published review; never a fabricated
    // rating for an unreviewed product.
    ...(ratingSummary.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingSummary.average,
            reviewCount: ratingSummary.count,
          },
        }
      : {}),
  };

  const productCategories = await marketingCatalog.listCategoriesForProduct(viewModel.product.id);
  const breadcrumbItems: BreadcrumbItem[] = [{ name: "Home", url: canonicalUrl(`/demo/${demoSlug}`) }];
  const primaryCategory = productCategories[0];
  if (primaryCategory) {
    breadcrumbItems.push({
      name: primaryCategory.title,
      url: canonicalUrl(`/demo/${demoSlug}/category/${primaryCategory.slug}`),
    });
  }
  breadcrumbItems.push({ name: viewModel.product.title, url: productUrl });

  return (
    <>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbList(breadcrumbItems)} />
      <InteractionTracker eventName="product_viewed" properties={{ productId: viewModel.product.id, slug: viewModel.product.slug }} />
      {bundle ? <BundleTierSelector demoSlug={demoSlug} bundle={bundle} pricingByTierId={pricingByTierId} /> : null}
      <Component
        demoSlug={demoSlug}
        viewModel={viewModel}
        stockBySkuId={stockBySkuId}
        // print-shop-02: isCustomizableProduct is print-shop-specific seed
        // data (see lib/seed.ts) but is a safe no-op for any other demo --
        // it returns false for a slug it doesn't recognize (e.g. a northline
        // product), so this call never needs a demoSlug guard.
        customizable={isCustomizableProduct(viewModel.product.slug)}
        // visual-fidelity-maximalist: additive -- see pdp-tabbed-detail.tsx's
        // themeKey doc comment. PdpLongScroll doesn't accept this prop
        // (TypeScript's excess-property check only fires for object
        // literals, not for a value passed through a union-typed
        // ComponentType, so this is safe for both branches).
        themeKey={activeTheme.key}
        // image-cdn epic: additive/optional, see pdp-tabbed-detail.tsx's
        // imageUrl doc comment -- null for any product without `images`,
        // rendering byte-for-byte what each template rendered before this
        // field existed.
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        // bare-basics epic: additive/optional, see pdp-tabbed-detail.tsx's
        // ratingSummary/reviews doc comment -- a zero-count summary and an
        // empty reviews array render byte-for-byte what each template
        // rendered before this feature existed (no rating line, "no reviews
        // yet" state, and the write-a-review form -- which was always
        // absent before this task).
        ratingSummary={ratingSummary}
        reviews={publishedReviews}
      />
      {recommendationShelf ? <RecommendationShelf {...recommendationShelf} /> : null}
    </>
  );
}
