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

/** meta._id is deterministically pageId -- a marketing page has exactly one meta record, so pageId IS the natural key. */
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
    _id: meta.pageId,
    _type: MARKETING_META_DOC_TYPE,
    pageId: meta.pageId,
    campaignName: meta.campaignName,
    startDate: meta.startDate,
    endDate: meta.endDate,
    productIds: meta.productIds,
  };
}
