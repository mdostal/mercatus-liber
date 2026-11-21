import type { LineCustomization, Money, Product, Sku } from "@mercatus-liber/core";

export interface CartItem {
  skuId: string;
  quantity: number;
  /** Price at add-time -- re-validated, not silently trusted, at checkout (see subsystem 09). */
  priceSnapshot: Money;
  /**
   * Free-text personalization captured at add-to-cart time for a product
   * flagged customizable on its PDP (e.g. "Text: Sarah -- thread color:
   * navy"). Added for the demo-store-print-shop-rebrand epic -- scoped down
   * per design-discussion.md §1b to exactly this one additive, optional
   * field (no design-asset uploads, no per-line customization subsystem;
   * that's the "wanted, not started" community-contributable item VISION.md
   * already lists). Omitted entirely (not present as a key) when a line
   * carries no customization, so every pre-existing call site/snapshot stays
   * byte-identical. Two additions of the same SKU only merge into one line
   * when their customizationNote also matches (see service.ts's addItem) --
   * otherwise they're kept as separate lines, since collapsing two different
   * personalizations into one quantity would silently lose one of them.
   */
  customizationNote?: string;
  /** What the shopper chose, for a made-to-order line. `priceSnapshot` is then the customized price, computed on the server. */
  customization?: LineCustomization;
  /** Identifies a customized line, since one SKU can have several. Pass it to removeItem and updateQuantity. Absent on other lines. */
  lineId?: string;
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
  /** When present, the product's sale window (activeFrom/activeTo) applies to its SKUs too. @mercatus-liber/catalog's CatalogService has it. */
  getProduct?(id: string): Promise<Pick<Product, "activeFrom" | "activeTo"> | null>;
}

export class SkuNotAvailableError extends Error {
  constructor(skuId: string, message?: string) {
    super(message ?? `SKU is not available for purchase: ${skuId}`);
    this.name = "SkuNotAvailableError";
  }
}

/**
 * Thrown when a SKU is outside its sale window (its own, or its product's).
 * A SkuNotAvailableError, so existing handling keeps working; `state` says
 * whether it hasn't opened yet or has ended.
 */
export class SkuNotOnSaleError extends SkuNotAvailableError {
  constructor(
    readonly skuId: string,
    readonly state: "upcoming" | "ended",
    readonly startsAt: string | null,
    readonly endsAt: string | null,
  ) {
    super(skuId, state === "upcoming" ? `This item goes on sale at ${startsAt}.` : `This item's sale ended at ${endsAt}.`);
    this.name = "SkuNotOnSaleError";
  }
}

export class CartNotFoundError extends Error {
  constructor(id: string) {
    super(`Cart not found: ${id}`);
    this.name = "CartNotFoundError";
  }
}

/** Thrown when a customized line's unit price can't be right. See AddItemOptions. */
export class InvalidUnitPriceError extends Error {
  constructor(reason: string) {
    super(`Invalid unit price: ${reason}`);
    this.name = "InvalidUnitPriceError";
  }
}
