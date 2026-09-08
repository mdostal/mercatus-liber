import type { Money, Sku } from "@mercatus-liber/core";

export interface CartItem {
  skuId: string;
  quantity: number;
  /** Price at add-time -- re-validated, not silently trusted, at checkout (see subsystem 09). */
  priceSnapshot: Money;
}

export interface Cart {
  id: string;
  items: CartItem[];
}

export interface CartRepository {
  get(id: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
}

/**
 * The narrowest possible read dependency cart has on catalog data -- a structural
 * interface, not an import of @mercatus-liber/catalog. @mercatus-liber/catalog's
 * CatalogService satisfies this shape already; cart's source never imports that
 * package (only its own tests do, to wire in a real implementation).
 */
export interface SkuLookup {
  getSku(id: string): Promise<Sku | null>;
}

export class SkuNotAvailableError extends Error {
  constructor(skuId: string) {
    super(`SKU is not available for purchase: ${skuId}`);
    this.name = "SkuNotAvailableError";
  }
}

export class CartNotFoundError extends Error {
  constructor(id: string) {
    super(`Cart not found: ${id}`);
    this.name = "CartNotFoundError";
  }
}
