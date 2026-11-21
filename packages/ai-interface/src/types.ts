import type { IdentifyingAttribute, Money, Product, Sku } from "@mercatus-liber/core";

/**
 * Every dependency below is a narrow structural interface, satisfied by the
 * real subsystem services (@mercatus-liber/catalog's CatalogService,
 * @mercatus-liber/cart's CartService, etc.) without this package ever
 * importing those packages -- the same "narrow dependency, structurally
 * satisfied" pattern as SkuLookup (cart), OrderLookup (inventory/account),
 * ProductDataLookup (search). See docs/subsystems/14-ai-mcp-interface.md and
 * this epic's own docs/ai-mcp-interface-decisions.md.
 */

export interface CatalogLookup {
  getProductBySlug(slug: string): Promise<Product | null>;
  listSkusByProduct(productId: string): Promise<Sku[]>;
}

export interface SearchLookup {
  query(params: { text?: string }): Promise<{ id: string; title: string; description: string }[]>;
}

export interface CartOps {
  createCart(): Promise<{ id: string }>;
  addItem(cartId: string, skuId: string, quantity: number): Promise<{ id: string; items: { skuId: string; quantity: number }[] }>;
  getCart(id: string): Promise<{ id: string; items: { skuId: string; quantity: number }[] } | null>;
}

export interface CheckoutOps {
  startCheckout(input: {
    cartId: string;
    idempotencyKey: string;
    shippingInfo: { name: string; email: string; address: string };
    successUrl: string;
    cancelUrl: string;
    customerId?: string | null;
  }): Promise<{ order: { id: string; status: string }; redirectUrl: string }>;
  getOrder(id: string): Promise<{ id: string; status: string; items: { skuId: string; quantity: number }[] } | null>;
}

export interface CatalogAdminOps {
  createProduct(input: { slug: string; title: string; description: string; identifyingAttributeKeys: string[] }): Promise<Product>;
  updateProduct(
    id: string,
    patch: { slug?: string; title?: string; description?: string; identifyingAttributeKeys?: string[] },
  ): Promise<Product>;
}

export interface CmsAdminOps {
  createPage(input: {
    pageType: string;
    slug: string;
    title: string;
    sections: { componentType: string; config: Record<string, unknown> }[];
  }): Promise<{ id: string; title: string; status: string }>;
  updatePage(id: string, patch: { title?: string; sections?: { componentType: string; config: Record<string, unknown> }[] }): Promise<{ id: string; title: string; status: string }>;
  publishPage(id: string): Promise<{ id: string; title: string; status: string }>;
}

export interface InventoryAdminOps {
  getStock(skuId: string): Promise<{ skuId: string; onHand: number; reserved: number } | null>;
  setStock(skuId: string, onHand: number): Promise<void>;
}

/**
 * A print-on-demand provider's catalog (Printful, ...), for agents to find
 * products and bring them into the store. Optional: without it the
 * provider_catalog_* tools aren't offered.
 */
export interface ProviderCatalogOps {
  /** The provider's name, e.g. "Printful", used in tool descriptions. */
  providerName: string;
  search(input: { text?: string; technique?: string; placement?: string; limit?: number }): Promise<unknown[]>;
  getProduct(id: string): Promise<unknown | null>;
  /** Creates a draft store product; never publishes. */
  bringOver(input: {
    productId: string;
    title: string;
    slug: string;
    description?: string;
    technique: string;
    colors: string[];
    sizes: string[];
    retailCents: number;
    sizeUpchargeCents?: Record<string, number>;
    files?: { placement: string; url: string }[];
  }): Promise<unknown>;
}

/** Lines (sales catalogs) for agents. Optional: without it the line tools aren't offered. */
export interface LineOps {
  listLines(input: { state?: "upcoming" | "active" | "ended" }): Promise<unknown[]>;
  getLine(slug: string): Promise<unknown | null>;
  /** Creates a line, or updates the one with this slug. Times are ISO 8601; products are given by slug. */
  saveLine(input: {
    slug: string;
    name: string;
    description?: string;
    status?: "draft" | "active";
    activeFrom?: string | null;
    activeTo?: string | null;
    hero?: { title: string; subtitle?: string; imageUrl?: string };
    sections?: { slug: string; title: string; productSlugs: string[] }[];
    applyWindowToProducts?: boolean;
  }): Promise<unknown>;
}

export interface CommerceToolDeps {
  catalog: CatalogLookup;
  search: SearchLookup;
  cart: CartOps;
  checkout: CheckoutOps;
  catalogAdmin: CatalogAdminOps;
  cms: CmsAdminOps;
  inventory: InventoryAdminOps;
  providerCatalog?: ProviderCatalogOps;
  lines?: LineOps;
}

export type ToolResult = unknown;

/** Re-exported so consumers building CatalogAdminOps inputs don't need a second import. */
export type { IdentifyingAttribute, Money };
