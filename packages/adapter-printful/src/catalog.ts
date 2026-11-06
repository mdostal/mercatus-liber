import { PrintfulApiError } from "./http-client.js";

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

export interface PrintfulCatalogClient {
  /**
   * What Printful would actually charge for these items shipped here, from an
   * order-estimation task, which creates no order. Can be lower than the price
   * list (a hoodie listed at 23.95 estimated at 22.63 on 2026-11-06), so use it
   * for real costs. Polls until the estimate is done.
   */
  estimateCosts(input: { recipient: { street1: string; city: string; stateCode?: string; countryCode: string; postalCode: string }; items: PrintfulEstimateItem[] }): Promise<PrintfulOrderCosts>;
  getProduct(productId: number): Promise<PrintfulCatalogProduct | null>;
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
    const response = await fetchImpl(`${baseUrl}${path}`, {
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
