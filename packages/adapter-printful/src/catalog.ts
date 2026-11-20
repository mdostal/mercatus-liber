import { PrintfulApiError } from "./http-client.js";
import { printfulFetch } from "./printful-fetch.js";

/**
 * Printful's v2 catalog, shipping-rate, webhook, and mockup endpoints -- the
 * read side of running a print-on-demand catalog. Nothing here creates an
 * order. Field names below were read from live v2 responses on 2026-11-06.
 */
export interface PrintfulCatalogClientConfig {
  apiToken: string;
  /** Required for an account-level token. */
  storeId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface PrintfulCatalogProduct {
  id: number;
  name: string;
  brand: string | null;
  model: string | null;
  type: string;
  image: string;
  description: string;
  is_discontinued: boolean;
}

export interface PrintfulCatalogVariant {
  id: number;
  catalog_product_id: number;
  name: string;
  size: string;
  color: string;
  color_code: string | null;
  image: string;
}

export interface PrintfulPrices {
  currency: string;
  product: { id: number; placements: { id: string; title: string; technique_key: string; price: string; discounted_price: string }[] };
  variants: { id: number; techniques: { technique_key: string; price: string; discounted_price: string }[] }[];
}

export interface PrintfulShippingRate {
  shipping: string;
  shipping_method_name: string;
  rate: string;
  currency: string;
  min_delivery_days: number;
  max_delivery_days: number;
}

export interface PrintfulMockupTask {
  id: number;
  status: "pending" | "completed" | "failed";
  catalog_variant_mockups?: { catalog_variant_id: number; mockups: { placement: string; mockup_url: string; style_id?: number }[] }[];
  failure_reasons?: unknown[];
}

export interface PrintfulPlacementFile {
  placement: string;
  technique: string;
  /** A public URL Printful can download the print file from. */
  url: string;
}

/** Printful's own cost breakdown for an order, in its dollar strings. */
export interface PrintfulOrderCosts {
  calculation_status: string;
  currency: string;
  subtotal: string;
  discount: string;
  shipping: string;
  tax: string;
  total: string;
}

export interface PrintfulEstimateItem {
  catalogVariantId: number;
  quantity: number;
  files: PrintfulPlacementFile[];
}

/** One product in Printful's catalog list (`GET /v2/catalog-products`), as Printful sends it. */
export interface PrintfulCatalogListing {
  id: number;
  type: string;
  main_category_id: number;
  name: string;
  brand: string | null;
  model: string | null;
  image: string;
  variant_count: number;
  is_discontinued: boolean;
  description: string;
  sizes: string[];
  colors: { name: string; value: string }[];
  techniques: { key: string; display_name: string; is_default: boolean }[];
  placements: { placement: string; technique: string }[];
}

export interface PrintfulCatalogCategory {
  id: number;
  parent_id: number | null;
  image_url: string;
  title: string;
}

/** Filters for Printful's catalog list. Lists are sent comma separated, as Printful takes them. */
export interface PrintfulCatalogQuery {
  categoryIds?: number[];
  colors?: string[];
  placements?: string[];
  techniques?: string[];
  /** Only products new to Printful's catalog. */
  newOnly?: boolean;
  /** e.g. "usa", "europe": only products sold there. */
  sellingRegion?: string;
  /** ISO country code: only products that ship there. */
  destinationCountry?: string;
  sortType?: "new" | "rating" | "price" | "bestseller";
  sortDirection?: "ascending" | "descending";
}

export interface PrintfulCatalogPage {
  products: PrintfulCatalogListing[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Where art goes on a product and how big it can be, from
 * `/v2/catalog-products/{id}/mockup-styles`. Printful gives the size in
 * inches with a dpi; the pixel size is what a print file should be.
 */
export interface PrintfulPrintArea {
  placement: string;
  displayName: string;
  technique: string;
  widthInches: number;
  heightInches: number;
  dpi: number;
  widthPx: number;
  heightPx: number;
  /** "simple" for most; other values (e.g. "color_group") mark special areas such as inside labels. */
  areaType: string | null;
  mockupStyles: { id: number; category: string; view: string; restrictedToVariants: number[] | null }[];
}

/**
 * A picture of the product with the print area marked on it, from
 * `/v2/catalog-products/{id}/mockup-templates`. Coordinates are pixels on the
 * template image. With `positioning: "overlay"` the template image goes on top
 * of the art (it has a transparent window); with "background" it goes under.
 */
export interface PrintfulMockupTemplate {
  placement: string;
  technique: string;
  catalogVariantIds: number[];
  imageUrl: string;
  backgroundUrl: string | null;
  backgroundColor: string | null;
  templateWidth: number;
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number };
  positioning: "overlay" | "background" | string;
  orientation: string;
}

export interface PrintfulVariantAvailability {
  catalogVariantId: number;
  techniques: { technique: string; regions: { name: string; availability: string }[] }[];
}

export interface PrintfulCatalogClient {
  /**
   * What Printful would actually charge for these items shipped here, from an
   * order-estimation task, which creates no order. Can be lower than the price
   * list (a hoodie listed at 23.95 estimated at 22.63 on 2026-11-06), so use it
   * for real costs. Polls until the estimate is done.
   */
  estimateCosts(input: { recipient: { street1: string; city: string; stateCode?: string; countryCode: string; postalCode: string }; items: PrintfulEstimateItem[] }): Promise<PrintfulOrderCosts>;
  getProduct(productId: number): Promise<PrintfulCatalogProduct | null>;
  /** One page of Printful's catalog (at most 100 products). */
  listCatalogProducts(query?: PrintfulCatalogQuery & { offset?: number; limit?: number }): Promise<PrintfulCatalogPage>;
  /** Every product matching the filters, following pagination (about 6 requests for the whole catalog). */
  listAllCatalogProducts(query?: PrintfulCatalogQuery): Promise<PrintfulCatalogListing[]>;
  /** One product with its colours, sizes, techniques and placements. */
  getCatalogListing(productId: number): Promise<PrintfulCatalogListing | null>;
  /** Every catalog category (they nest through parent_id). */
  listCategories(): Promise<PrintfulCatalogCategory[]>;
  /** Every print area on a product, optionally only some placements. */
  getPrintAreas(productId: number, options?: { placements?: string[] }): Promise<PrintfulPrintArea[]>;
  /** Template images with the print area marked, optionally only some placements. Each covers the variants in catalogVariantIds. */
  getMockupTemplates(productId: number, options?: { placements?: string[] }): Promise<PrintfulMockupTemplate[]>;
  /** Stock by technique and selling region for every variant. */
  getAvailability(productId: number): Promise<PrintfulVariantAvailability[]>;
  /** One variant, or null. Its catalog_product_id says which product it belongs to. */
  getVariant(variantId: number): Promise<PrintfulCatalogVariant | null>;
  /** Every variant (every color and size), following pagination. */
  listVariants(productId: number): Promise<PrintfulCatalogVariant[]>;
  /** Prices for every variant, following pagination. */
  getPrices(productId: number): Promise<PrintfulPrices | null>;
  getShippingRates(input: { recipient: { countryCode: string; stateCode?: string; postalCode?: string }; items: { catalogVariantId: number; quantity: number }[] }): Promise<PrintfulShippingRate[]>;
  getWebhooks(): Promise<{ default_url: string | null; events: { type: string; url: string | null }[] }>;
  /** Starts mockup rendering. Poll with getMockupTasks. */
  createMockupTasks(input: { productId: number; variantIds: number[]; styleIds?: number[]; files: PrintfulPlacementFile[]; format?: "jpg" | "png" }): Promise<PrintfulMockupTask[]>;
  getMockupTasks(taskIds: number[]): Promise<PrintfulMockupTask[]>;
}

export function createPrintfulCatalogClient(config: PrintfulCatalogClientConfig): PrintfulCatalogClient {
  const baseUrl = config.baseUrl ?? "https://api.printful.com";
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const response = await printfulFetch(fetchImpl, `${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        ...(config.storeId ? { "X-PF-Store-Id": config.storeId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404) return null;
    const json = (await response.json()) as unknown;
    if (!response.ok) throw new PrintfulApiError(method, path, response.status, json);
    return json as T;
  }
  const data = async <T>(method: string, path: string, body?: unknown): Promise<T | null> => (await request<{ data: T }>(method, path, body))?.data ?? null;

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  /** Follows Printful's offset paging for a list endpoint, 100 at a time. */
  async function all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    const join = path.includes("?") ? "&" : "?";
    for (let offset = 0; ; offset += 100) {
      const page = await request<{ data: T[]; paging?: { total: number } }>("GET", `${path}${join}limit=100&offset=${offset}`);
      if (!page) return items;
      items.push(...page.data);
      if (page.data.length === 0 || !page.paging || items.length >= page.paging.total) return items;
    }
  }

  return {
    async estimateCosts({ recipient, items }) {
      const body = {
        recipient: { address1: recipient.street1, city: recipient.city, country_code: recipient.countryCode, zip: recipient.postalCode, ...(recipient.stateCode ? { state_code: recipient.stateCode } : {}) },
        order_items: items.map((item) => ({
          source: "catalog",
          catalog_variant_id: item.catalogVariantId,
          quantity: item.quantity,
          placements: item.files.map((file) => ({ placement: file.placement, technique: file.technique, layers: [{ type: "file", url: file.url }] })),
        })),
      };
      let task = await data<{ id: string; status: string; costs: PrintfulOrderCosts | null; failure_reasons?: unknown }>("POST", "/v2/order-estimation-tasks", body);
      for (let attempt = 0; attempt < 20 && task && task.status === "pending"; attempt++) {
        await sleep(1000);
        task = await data<{ id: string; status: string; costs: PrintfulOrderCosts | null }>("GET", `/v2/order-estimation-tasks?id=${task.id}`);
      }
      if (!task?.costs || task.status !== "completed") throw new Error(`Printful couldn't estimate this order: ${JSON.stringify(task)}`.slice(0, 500));
      return task.costs;
    },
    getProduct: (productId) => data<PrintfulCatalogProduct>("GET", `/v2/catalog-products/${productId}`),
    async listCatalogProducts(query = {}) {
      const limit = Math.min(Math.max(query.limit ?? 100, 1), 100);
      const params = catalogQueryParams(query);
      params.set("limit", String(limit));
      params.set("offset", String(query.offset ?? 0));
      const page = await request<{ data: PrintfulCatalogListing[]; paging: { total: number; offset: number; limit: number } }>("GET", `/v2/catalog-products?${params}`);
      return { products: page?.data ?? [], total: page?.paging.total ?? 0, offset: page?.paging.offset ?? 0, limit: page?.paging.limit ?? limit };
    },
    async listAllCatalogProducts(query = {}) {
      const params = catalogQueryParams(query).toString();
      return all<PrintfulCatalogListing>(`/v2/catalog-products${params ? `?${params}` : ""}`);
    },
    getCatalogListing: (productId) => data<PrintfulCatalogListing>("GET", `/v2/catalog-products/${productId}`),
    listCategories: () => all<PrintfulCatalogCategory>("/v2/catalog-categories"),
    async getPrintAreas(productId, options = {}) {
      const query = options.placements?.length ? `?placements=${options.placements.map(encodeURIComponent).join(",")}` : "";
      const rows = await all<RawMockupStyleGroup>(`/v2/catalog-products/${productId}/mockup-styles${query}`);
      return rows.map(toPrintArea);
    },
    async getMockupTemplates(productId, options = {}) {
      const query = options.placements?.length ? `?placements=${options.placements.map(encodeURIComponent).join(",")}` : "";
      const rows = await all<RawMockupTemplate>(`/v2/catalog-products/${productId}/mockup-templates${query}`);
      return rows.map(toMockupTemplate);
    },
    async getAvailability(productId) {
      const rows = await all<RawAvailability>(`/v2/catalog-products/${productId}/availability`);
      return rows.map((row) => ({
        catalogVariantId: row.catalog_variant_id,
        techniques: row.techniques.map((t) => ({ technique: t.technique, regions: t.selling_regions.map((r) => ({ name: r.name, availability: r.availability })) })),
      }));
    },
    getVariant: (variantId) => data<PrintfulCatalogVariant>("GET", `/v2/catalog-variants/${variantId}`),
    async listVariants(productId) {
      const variants: PrintfulCatalogVariant[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await request<{ data: PrintfulCatalogVariant[]; paging: { total: number } }>("GET", `/v2/catalog-products/${productId}/catalog-variants?limit=100&offset=${offset}`);
        if (!page) return variants;
        variants.push(...page.data);
        if (page.data.length === 0 || variants.length >= page.paging.total) return variants;
      }
    },
    // Prices are paged by variant (20 per page by default), so a single call silently misses most sizes.
    async getPrices(productId) {
      let prices: PrintfulPrices | null = null;
      for (let offset = 0; ; offset += 100) {
        const page = await request<{ data: PrintfulPrices; paging?: { total: number } }>("GET", `/v2/catalog-products/${productId}/prices?limit=100&offset=${offset}`);
        if (!page) return prices;
        if (prices) prices.variants.push(...page.data.variants);
        else prices = page.data;
        if (page.data.variants.length === 0 || !page.paging || prices.variants.length >= page.paging.total) return prices;
      }
    },
    async getShippingRates({ recipient, items }) {
      const body = {
        recipient: { country_code: recipient.countryCode, ...(recipient.stateCode ? { state_code: recipient.stateCode } : {}), ...(recipient.postalCode ? { zip: recipient.postalCode } : {}) },
        order_items: items.map((item) => ({ source: "catalog", catalog_variant_id: item.catalogVariantId, quantity: item.quantity })),
      };
      return (await data<PrintfulShippingRate[]>("POST", "/v2/shipping-rates", body)) ?? [];
    },
    async getWebhooks() {
      return (await data<{ default_url: string | null; events: { type: string; url: string | null }[] }>("GET", "/v2/webhooks")) ?? { default_url: null, events: [] };
    },
    async createMockupTasks({ productId, variantIds, styleIds, files, format = "jpg" }) {
      const body = {
        format,
        products: [
          {
            source: "catalog",
            catalog_product_id: productId,
            catalog_variant_ids: variantIds,
            ...(styleIds ? { mockup_style_ids: styleIds } : {}),
            placements: files.map((file) => ({ placement: file.placement, technique: file.technique, layers: [{ type: "file", url: file.url }] })),
          },
        ],
      };
      return (await data<PrintfulMockupTask[]>("POST", "/v2/mockup-tasks", body)) ?? [];
    },
    async getMockupTasks(taskIds) {
      return (await data<PrintfulMockupTask[]>("GET", `/v2/mockup-tasks?id=${taskIds.join(",")}`)) ?? [];
    },
  };
}

/** Converts a Printful dollar string to whole cents without float drift. */
export function printfulPriceToCents(price: string): number {
  const [whole = "0", fraction = ""] = price.trim().split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

/**
 * What Printful charges for one unit of a variant with these placements,
 * before shipping and tax: the variant's price for the technique covers one
 * placement, and each additional placement adds its own price. Uses the
 * discounted price where there is one.
 *
 * Checked against real draft-order costs on 2026-11-06: a Gildan 64000 with a
 * front print cost 9.63, the same with front and back 15.58, back alone 9.63.
 * Those placements cost the same, so which one counts as included when prices
 * differ isn't confirmed; this assumes the most expensive one is.
 */
export function printfulUnitCostCents(prices: PrintfulPrices, variantId: number, technique: string, placements: string[]): number {
  const variant = prices.variants.find((v) => v.id === variantId);
  const base = variant?.techniques.find((t) => t.technique_key === technique);
  if (!base) throw new Error(`Printful variant ${variantId} has no ${technique} price`);
  const placementCents = placements.map((placement) => {
    const found = prices.product.placements.find((p) => p.id === placement && p.technique_key === technique);
    if (!found) throw new Error(`Printful product ${prices.product.id} has no ${placement} placement for ${technique}`);
    return printfulPriceToCents(found.discounted_price || found.price);
  });
  const extra = placementCents.reduce((sum, cents) => sum + cents, 0) - (placementCents.length > 0 ? Math.max(...placementCents) : 0);
  return printfulPriceToCents(base.discounted_price || base.price) + extra;
}

function catalogQueryParams(query: PrintfulCatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  const list = (key: string, values?: (string | number)[]) => {
    if (values?.length) params.set(key, values.join(","));
  };
  list("category_ids", query.categoryIds);
  list("colors", query.colors);
  list("placements", query.placements);
  list("techniques", query.techniques);
  if (query.newOnly) params.set("new", "true");
  if (query.sellingRegion) params.set("selling_region_name", query.sellingRegion);
  if (query.destinationCountry) params.set("destination_country", query.destinationCountry);
  if (query.sortType) params.set("sort_type", query.sortType);
  if (query.sortDirection) params.set("sort_direction", query.sortDirection);
  return params;
}

interface RawMockupStyleGroup {
  placement: string;
  display_name: string;
  technique: string;
  print_area_width: number;
  print_area_height: number;
  print_area_type: string | null;
  dpi: number;
  mockup_styles: { id: number; category_name: string; view_name: string; restricted_to_variants: number[] | null }[];
}

interface RawMockupTemplate {
  catalog_variant_ids: number[];
  placement: string;
  technique: string;
  image_url: string;
  background_url: string | null;
  background_color: string | null;
  template_width: number;
  template_height: number;
  print_area_width: number;
  print_area_height: number;
  print_area_top: number;
  print_area_left: number;
  template_positioning: string;
  orientation: string;
}

interface RawAvailability {
  catalog_variant_id: number;
  techniques: { technique: string; selling_regions: { name: string; availability: string }[] }[];
}

/** Printful's mockup-styles row as a print area. Checked live on 2026-11-20: product 71 front is 12 x 16 in at 150 dpi (1800 x 2400 px). */
export function toPrintArea(row: RawMockupStyleGroup): PrintfulPrintArea {
  return {
    placement: row.placement,
    displayName: row.display_name,
    technique: row.technique,
    widthInches: row.print_area_width,
    heightInches: row.print_area_height,
    dpi: row.dpi,
    widthPx: Math.round(row.print_area_width * row.dpi),
    heightPx: Math.round(row.print_area_height * row.dpi),
    areaType: row.print_area_type ?? null,
    mockupStyles: row.mockup_styles.map((style) => ({ id: style.id, category: style.category_name, view: style.view_name, restrictedToVariants: style.restricted_to_variants })),
  };
}

function toMockupTemplate(row: RawMockupTemplate): PrintfulMockupTemplate {
  return {
    placement: row.placement,
    technique: row.technique,
    catalogVariantIds: row.catalog_variant_ids,
    imageUrl: row.image_url,
    backgroundUrl: row.background_url,
    backgroundColor: row.background_color,
    templateWidth: row.template_width,
    templateHeight: row.template_height,
    printArea: { top: row.print_area_top, left: row.print_area_left, width: row.print_area_width, height: row.print_area_height },
    positioning: row.template_positioning,
    orientation: row.orientation,
  };
}

/** The template for one variant and placement, or null. */
export function templateFor(templates: PrintfulMockupTemplate[], variantId: number, placement: string): PrintfulMockupTemplate | null {
  return templates.find((t) => t.placement === placement && t.catalogVariantIds.includes(variantId)) ?? null;
}
