import type { Money, Product, Sku } from "@mercatus-liber/core";

/** Promotion fields the API reads and writes, mirroring @mercatus-liber/promotions without importing it. */
export interface StoreApiPromotion {
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
}

export type StoreApiPromotionInput = Omit<StoreApiPromotion, "id" | "redemptionCount" | "status"> & { status?: "active" | "inactive" };

export interface StoreApiCategory {
  id: string;
  slug: string;
  title: string;
  description: string;
  parentId: string | null;
}

export interface StoreApiWebhookSubscription {
  id: string;
  url: string;
  eventTypes: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

/**
 * Everything the API reads and writes, as narrow structural interfaces, so it
 * works with this repo's services and with any store that provides the same
 * calls. A store supplies only what it uses: an endpoint whose dependency is
 * missing answers 404.
 */
export interface StoreApiDeps {
  store: {
    name: string;
    currency: string;
    /** The storefront's public origin and path, without a trailing slash. */
    url: string;
    /** A product page's public path or URL. Defaults to `${url}/products/${slug}`. */
    productUrl?: (product: Product) => string;
  };
  catalog: {
    listProducts(filter?: { status?: Product["status"] }): Promise<Product[]>;
    getProduct(id: string): Promise<Product | null>;
    listSkusByProduct(productId: string): Promise<Sku[]>;
  };
  categories?: {
    listCategories(): Promise<StoreApiCategory[]>;
    listCategoriesForProduct(productId: string): Promise<StoreApiCategory[]>;
  };
  promotions?: {
    listPromotions(): Promise<StoreApiPromotion[]>;
    getPromotion(id: string): Promise<StoreApiPromotion | null>;
    createPromotion(input: StoreApiPromotionInput): Promise<StoreApiPromotion>;
    updatePromotion(id: string, input: Partial<StoreApiPromotionInput> & { status?: "active" | "inactive" }): Promise<StoreApiPromotion | null>;
  };
  webhooks?: {
    create(input: { url: string; eventTypes: string[] }): Promise<StoreApiWebhookSubscription>;
    list(): Promise<StoreApiWebhookSubscription[]>;
    delete(id: string): Promise<void>;
  };
  /** Clock for promotion schedules. Defaults to now. */
  now?: () => Date;
}

/** A variant as the API returns it. */
export interface ApiVariant {
  id: string;
  options: Record<string, string | number | boolean>;
  price: Money;
  /** Present when an active product promotion applies to this variant now. */
  salePrice?: Money;
  salePromotionId?: string;
  status: Sku["status"];
  availability: "active" | "discontinued" | "request";
  images: { url: string; alt: string }[];
}

export interface ApiProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: Product["status"];
  url: string;
  images: { url: string; alt: string }[];
  categories: { id: string; slug: string; title: string }[];
  variants: ApiVariant[];
  priceRange: { min: Money; max: Money } | null;
}
