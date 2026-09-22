import { randomUUID } from "node:crypto";
import { PageNotFoundError } from "./types.js";
import type {
  CmsPersistenceAdapter,
  ComponentInstance,
  ComponentRegistry,
  MarketingPageMeta,
  Page,
  PageStatus,
  PageType,
} from "./types.js";

export interface NewPageInput {
  pageType: PageType;
  slug: string;
  title: string;
  sections: ComponentInstance[];
  /** Optional, additive -- see Page.demoSlug's doc comment in types.ts for why this exists. */
  demoSlug?: string;
}

export interface NewMarketingPageInput {
  slug: string;
  title: string;
  sections: ComponentInstance[];
  campaignName: string;
  startDate: string;
  endDate: string | null;
  productIds: string[];
  /** Optional, additive -- threaded onto the underlying Page a marketing page IS (see createMarketingPage below). See Page.demoSlug's doc comment in types.ts. */
  demoSlug?: string;
}

export interface CmsService {
  createPage(input: NewPageInput): Promise<Page>;
  updatePage(id: string, patch: Partial<Pick<Page, "title" | "sections">>): Promise<Page>;
  publishPage(id: string): Promise<Page>;
  getPage(id: string): Promise<Page | null>;
  getPageBySlug(slug: string): Promise<Page | null>;
  listPages(filter?: { pageType?: PageType; status?: PageStatus; demoSlug?: string }): Promise<Page[]>;

  createMarketingPage(input: NewMarketingPageInput): Promise<{ page: Page; meta: MarketingPageMeta }>;
  getMarketingPageMeta(pageId: string): Promise<MarketingPageMeta | null>;

  components: ComponentRegistry;
}

export function createCmsService(deps: {
  persistence: CmsPersistenceAdapter;
  components: ComponentRegistry;
}): CmsService {
  const { pages, marketingMeta } = deps.persistence;
  const { components } = deps;

  async function requirePage(id: string): Promise<Page> {
    const page = await pages.get(id);
    if (!page) throw new PageNotFoundError(id);
    return page;
  }

  return {
    async createPage(input) {
      const page: Page = {
        id: randomUUID(),
        pageType: input.pageType,
        slug: input.slug,
        title: input.title,
        status: "draft",
        sections: input.sections,
        // exactOptionalPropertyTypes: only set the key when a real value was
        // given, rather than assigning `undefined` to it explicitly.
        ...(input.demoSlug !== undefined ? { demoSlug: input.demoSlug } : {}),
      };
      await pages.save(page);
      return page;
    },

    async updatePage(id, patch) {
      const existing = await requirePage(id);
      const updated: Page = { ...existing, ...patch };
      await pages.save(updated);
      return updated;
    },

    async publishPage(id) {
      const existing = await requirePage(id);
      const published: Page = { ...existing, status: "published" };
      await pages.save(published);
      return published;
    },

    async getPage(id) {
      return pages.get(id);
    },

    async getPageBySlug(slug) {
      return pages.getBySlug(slug);
    },

    async listPages(filter) {
      return pages.list(filter);
    },

    async createMarketingPage(input) {
      const page: Page = {
        id: randomUUID(),
        pageType: "marketing",
        slug: input.slug,
        title: input.title,
        status: "draft",
        sections: input.sections,
        ...(input.demoSlug !== undefined ? { demoSlug: input.demoSlug } : {}),
      };
      await pages.save(page);

      const meta: MarketingPageMeta = {
        pageId: page.id,
        campaignName: input.campaignName,
        startDate: input.startDate,
        endDate: input.endDate,
        productIds: input.productIds,
      };
      await marketingMeta.save(meta);

      return { page, meta };
    },

    async getMarketingPageMeta(pageId) {
      return marketingMeta.getByPageId(pageId);
    },

    components,
  };
}
