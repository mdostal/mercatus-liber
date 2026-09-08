import type { CmsPersistenceAdapter, MarketingPageMeta, MarketingPageMetaRepository, Page, PageRepository } from "./types.js";

export function createInMemoryPageRepository(): PageRepository {
  const pages = new Map<string, Page>();
  return {
    async get(id) {
      const page = pages.get(id);
      return page ? structuredClone(page) : null;
    },
    async getBySlug(slug) {
      for (const page of pages.values()) {
        if (page.slug === slug) return structuredClone(page);
      }
      return null;
    },
    async list(filter) {
      let result = [...pages.values()];
      if (filter?.pageType) result = result.filter((p) => p.pageType === filter.pageType);
      if (filter?.status) result = result.filter((p) => p.status === filter.status);
      return result.map((p) => structuredClone(p));
    },
    async save(page) {
      pages.set(page.id, structuredClone(page));
    },
  };
}

export function createInMemoryMarketingPageMetaRepository(): MarketingPageMetaRepository {
  const metaByPageId = new Map<string, MarketingPageMeta>();
  return {
    async getByPageId(pageId) {
      const meta = metaByPageId.get(pageId);
      return meta ? structuredClone(meta) : null;
    },
    async save(meta) {
      metaByPageId.set(meta.pageId, structuredClone(meta));
    },
  };
}

/** Bundles the two in-memory repositories into one CmsPersistenceAdapter -- the default, zero-infra adapter, same convenience-factory pattern as adapter-sqlite for catalog. */
export function createInMemoryCmsAdapter(): CmsPersistenceAdapter {
  return {
    pages: createInMemoryPageRepository(),
    marketingMeta: createInMemoryMarketingPageMetaRepository(),
  };
}
