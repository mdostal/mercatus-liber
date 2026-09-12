import type { MarketingPageMeta, Page } from "@mercatus-liber/cms";

/**
 * Page <-> Sanity document mapping. Unlike Shopify's server-assigned GIDs,
 * Sanity documents accept a caller-specified _id at creation time
 * (createOrReplace), so Page.id maps directly to _id -- no id-bridging
 * needed. See this epic's docs/cms-adapters-design.md.
 */
export const PAGE_DOC_TYPE = "page";
export const MARKETING_META_DOC_TYPE = "marketingPageMeta";

export interface SanityPageDoc {
  _id: string;
  _type: typeof PAGE_DOC_TYPE;
  pageType: Page["pageType"];
  slug: string;
  title: string;
  status: Page["status"];
  sections: Page["sections"];
}

export function pageDocToPage(doc: SanityPageDoc): Page {
  return {
    id: doc._id,
    pageType: doc.pageType,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    sections: doc.sections,
  };
}

export function pageToPageDoc(page: Page): SanityPageDoc {
  return {
    _id: page.id,
    _type: PAGE_DOC_TYPE,
    pageType: page.pageType,
    slug: page.slug,
    title: page.title,
    status: page.status,
    sections: page.sections,
  };
}

/**
 * **Correction, found live against a real Sanity dataset for the first
 * time**: this doc's `_id` used to be the bare `pageId` itself, on the
 * assumption that "a marketing page has exactly one meta record, so pageId
 * IS the natural key" -- true as a LOGICAL key, but Sanity's own `_id`
 * namespace is global across every `_type` in a dataset, not scoped per
 * type the way a relational table's own primary key is. Since the PAGE
 * document (`SanityPageDoc`, `_type: "page"`) ALSO uses that exact same
 * `pageId` string as its own `_id` (see `pageToPageDoc` above), the two
 * documents collided on identity -- the second `createOrReplace` call
 * failed with a real, confirmed Sanity error ("document \"<id>\": immutable
 * attribute \"_type\" may not be modified"), since Sanity refuses to let an
 * existing document change type. Prefixed instead (`marketingMetaDocId`
 * below) -- still deterministically derived from pageId (so `getByPageId`
 * stays a direct `_id` lookup, never a query), but now genuinely distinct
 * from the page document's own `_id`.
 */
export function marketingMetaDocId(pageId: string): string {
  return `marketingPageMeta.${pageId}`;
}

export interface SanityMarketingMetaDoc {
  _id: string;
  _type: typeof MARKETING_META_DOC_TYPE;
  pageId: string;
  campaignName: string;
  startDate: string;
  endDate: string | null;
  productIds: string[];
}

export function metaDocToMeta(doc: SanityMarketingMetaDoc): MarketingPageMeta {
  return {
    pageId: doc.pageId,
    campaignName: doc.campaignName,
    startDate: doc.startDate,
    endDate: doc.endDate,
    productIds: doc.productIds,
  };
}

export function metaToMetaDoc(meta: MarketingPageMeta): SanityMarketingMetaDoc {
  return {
    _id: marketingMetaDocId(meta.pageId),
    _type: MARKETING_META_DOC_TYPE,
    pageId: meta.pageId,
    campaignName: meta.campaignName,
    startDate: meta.startDate,
    endDate: meta.endDate,
    productIds: meta.productIds,
  };
}
