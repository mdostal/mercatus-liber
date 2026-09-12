import type { CmsPersistenceAdapter, MarketingPageMetaRepository, PageRepository } from "@mercatus-liber/cms";
import { createSanityClient, type SanityAdapterConfig } from "./sanity-client.js";
import {
  MARKETING_META_DOC_TYPE,
  marketingMetaDocId,
  metaDocToMeta,
  metaToMetaDoc,
  PAGE_DOC_TYPE,
  pageDocToPage,
  pageToPageDoc,
  type SanityMarketingMetaDoc,
  type SanityPageDoc,
} from "./mapping.js";

export type { SanityAdapterConfig } from "./sanity-client.js";
export { SanityApiError } from "./sanity-client.js";

/**
 * Third reference CmsPersistenceAdapter implementation (after the built-in
 * in-memory one), backed by Sanity's real Content API. Public surface is
 * exactly CmsPersistenceAdapter -- no Sanity-specific type is exported. See
 * .pHive/epics/cms-content-adapters/docs/cms-adapters-design.md.
 */
export function createSanityAdapter(config: SanityAdapterConfig): CmsPersistenceAdapter {
  const client = createSanityClient(config);

  const pages: PageRepository = {
    async get(id) {
      const doc = await client.query<SanityPageDoc | null>(`*[_type == "${PAGE_DOC_TYPE}" && _id == $id][0]`, { id });
      return doc ? pageDocToPage(doc) : null;
    },

    async getBySlug(slug) {
      const doc = await client.query<SanityPageDoc | null>(`*[_type == "${PAGE_DOC_TYPE}" && slug == $slug][0]`, { slug });
      return doc ? pageDocToPage(doc) : null;
    },

    async list(filter) {
      const clauses: string[] = [];
      const params: Record<string, unknown> = {};
      if (filter?.pageType) {
        clauses.push("pageType == $pageType");
        params.pageType = filter.pageType;
      }
      if (filter?.status) {
        clauses.push("status == $status");
        params.status = filter.status;
      }
      const where = clauses.length > 0 ? ` && ${clauses.join(" && ")}` : "";
      const docs = await client.query<SanityPageDoc[]>(`*[_type == "${PAGE_DOC_TYPE}"${where}]`, params);
      return docs.map(pageDocToPage);
    },

    async save(page) {
      await client.mutate([{ createOrReplace: pageToPageDoc(page) }]);
    },
  };

  const marketingMeta: MarketingPageMetaRepository = {
    async getByPageId(pageId) {
      const doc = await client.query<SanityMarketingMetaDoc | null>(
        `*[_type == "${MARKETING_META_DOC_TYPE}" && _id == $id][0]`,
        { id: marketingMetaDocId(pageId) },
      );
      return doc ? metaDocToMeta(doc) : null;
    },

    async save(meta) {
      await client.mutate([{ createOrReplace: metaToMetaDoc(meta) }]);
    },
  };

  return { pages, marketingMeta };
}
