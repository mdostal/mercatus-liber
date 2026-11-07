/**
 * Client for a Mercatus Liber store API (@mercatus-liber/store-api). Types are
 * declared here rather than imported, so an app like flayr can use this package
 * without pulling in any of the framework.
 */

export interface Money {
  /** Minor units, e.g. cents. */
  amount: number;
  currency: string;
}

export interface MercatusVariant {
  id: string;
  options: Record<string, string | number | boolean>;
  price: Money;
  salePrice?: Money;
  salePromotionId?: string;
  status: "draft" | "active" | "archived";
  availability: "active" | "discontinued" | "request";
  images: { url: string; alt: string }[];
}

export interface MercatusProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "active" | "archived";
  url: string;
  images: { url: string; alt: string }[];
  categories: { id: string; slug: string; title: string }[];
  variants: MercatusVariant[];
  priceRange: { min: Money; max: Money } | null;
}

export interface MercatusCategory {
  id: string;
  slug: string;
  title: string;
  description: string;
  parentId: string | null;
}

export interface MercatusPromotion {
  id: string;
  code: string | null;
  kind: "percentage" | "fixed";
  scope: "cart" | "product";
  value: number;
  currency: string;
  targetSkuIds: string[];
  minCartAmount: Money | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  redemptionCount: number;
  status: "active" | "inactive";
  /** Active, inside its dates, and under its usage limit right now. */
  live: boolean;
}

export interface NewMercatusPromotion {
  /** Null makes it apply automatically, with no code. */
  code?: string | null;
  kind: "percentage" | "fixed";
  /** Percent (0-100] or whole cents. */
  value: number;
  /** Empty or omitted applies to the whole cart. */
  targetSkuIds?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  minCartAmountCents?: number | null;
  /** Defaults to "inactive", so nothing goes live until someone turns it on. */
  status?: "active" | "inactive";
}

export interface MercatusWebhook {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

export type MercatusScope = "products:read" | "promotions:read" | "promotions:write" | "webhooks:manage";

export class MercatusApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MercatusApiError";
  }
}

export interface MercatusStoreClientConfig {
  /** The API's full base URL, e.g. "https://shop.example/api/store/v1". */
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export function createMercatusStoreClient(config: MercatusStoreClientConfig) {
  const base = config.baseUrl.replace(/\/$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.apiKey}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return undefined as T;
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // handled below
    }
    if (!response.ok) {
      const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new MercatusApiError(response.status, error?.code ?? "http_error", error?.message ?? `HTTP ${response.status}`);
    }
    return json as T;
  }

  return {
    /** Proves the key works, and says what it can do. */
    getStore: () => request<{ name: string; currency: string; url: string; scopes: MercatusScope[] }>("GET", "/store"),
    listProducts: (options: { limit?: number; cursor?: string; status?: "active" | "draft" | "archived" | "all" } = {}) => {
      const query = new URLSearchParams();
      if (options.limit) query.set("limit", String(options.limit));
      if (options.cursor) query.set("cursor", options.cursor);
      if (options.status) query.set("status", options.status);
      const qs = query.toString();
      return request<{ data: MercatusProduct[]; nextCursor: string | null; total: number }>("GET", `/products${qs ? `?${qs}` : ""}`);
    },
    /** Every product, following the cursor. */
    async listAllProducts(options: { status?: "active" | "draft" | "archived" | "all" } = {}): Promise<MercatusProduct[]> {
      const all: MercatusProduct[] = [];
      let cursor: string | null = null;
      do {
        const page: { data: MercatusProduct[]; nextCursor: string | null } = await this.listProducts({ limit: 100, ...(cursor ? { cursor } : {}), ...options });
        all.push(...page.data);
        cursor = page.nextCursor;
      } while (cursor);
      return all;
    },
    getProduct: async (id: string) => (await request<{ data: MercatusProduct }>("GET", `/products/${encodeURIComponent(id)}`)).data,
    listCategories: async () => (await request<{ data: MercatusCategory[] }>("GET", "/categories")).data,
    listPromotions: async () => (await request<{ data: MercatusPromotion[] }>("GET", "/promotions")).data,
    createPromotion: async (input: NewMercatusPromotion) => (await request<{ data: MercatusPromotion }>("POST", "/promotions", input)).data,
    updatePromotion: async (id: string, patch: Partial<NewMercatusPromotion>) => (await request<{ data: MercatusPromotion }>("PATCH", `/promotions/${encodeURIComponent(id)}`, patch)).data,
    listWebhooks: async () => (await request<{ data: MercatusWebhook[] }>("GET", "/webhooks")).data,
    /** The returned secret is shown only now: store it to verify deliveries. */
    createWebhook: async (input: { url: string; eventTypes: string[] }) => (await request<{ data: MercatusWebhook & { secret: string } }>("POST", "/webhooks", input)).data,
    deleteWebhook: (id: string) => request<void>("DELETE", `/webhooks/${encodeURIComponent(id)}`),
  };
}

export type MercatusStoreClient = ReturnType<typeof createMercatusStoreClient>;

/** The headers on every webhook delivery. */
export const MERCATUS_SIGNATURE_HEADER = "x-mercatus-liber-signature";
export const MERCATUS_EVENT_HEADER = "x-mercatus-liber-event";
export const MERCATUS_DELIVERY_ID_HEADER = "x-mercatus-liber-delivery-id";

/** Event types a catalog sync cares about. */
export const MERCATUS_CATALOG_EVENTS = ["catalog.product.created", "catalog.product.updated", "catalog.product.archived", "catalog.sku.created"] as const;

/**
 * Checks a delivery's `x-mercatus-liber-signature` (`sha256=<hex>` HMAC of the
 * raw body) in constant time. Pass the body exactly as received, before parsing.
 */
export async function verifyMercatusWebhook(rawBody: string | Uint8Array, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes as BufferSource));
  const expected = `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}
