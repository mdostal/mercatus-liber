import { randomUUID } from "node:crypto";
import { PageNotFoundError } from "./types.js";
import type {
  ComponentInstance,
  ComponentRegistry,
  MarketingPageMeta,
  MarketingPageMetaRepository,
  Page,
  PageRepository,
  PageStatus,
  PageType,
} from "./types.js";

export interface NewPageInput {
  pageType: PageType;
  slug: string;
  title: string;
  sections: ComponentInstance[];
}

export interface NewMarketingPageInput {
  slug: string;
  title: string;
  sections: ComponentInstance[];
  campaignName: string;
  startDate: string;
  endDate: string | null;
  productIds: string[];
}

export interface CmsService {
  createPage(input: NewPageInput): Promise<Page>;
  updatePage(id: string, patch: Partial<Pick<Page, "title" | "sections">>): Promise<Page>;
  publishPage(id: string): Promise<Page>;
  getPage(id: string): Promise<Page | null>;
  getPageBySlug(slug: string): Promise<Page | null>;
  listPages(filter?: { pageType?: PageType; status?: PageStatus }): Promise<Page[]>;

  createMarketingPage(input: NewMarketingPageInput): Promise<{ page: Page; meta: MarketingPageMeta }>;
  getMarketingPageMeta(pageId: string): Promise<MarketingPageMeta | null>;

  components: ComponentRegistry;
}

export function createCmsService(deps: {
  pages: PageRepository;
  marketingMeta: MarketingPageMetaRepository;
  components: ComponentRegistry;
}): CmsService {
  const { pages, marketingMeta, components } = deps;

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
