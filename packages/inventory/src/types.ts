export interface StockLevel {
  skuId: string;
  onHand: number;
  /** Reserved by in-flight (unpaid) orders -- available = onHand - reserved. */
  reserved: number;
}

/**
 * The pluggable inventory backend contract (subsystem 11). The default
 * in-house adapter ships in this package; an external-IMS adapter is the
 * same interface with a different implementation proxying to a real system
 * -- a contract, not something this package has to build a second concrete
 * implementation of (see this story's design decisions).
 */
export interface InventoryAdapter {
  getStock(skuId: string): Promise<StockLevel | null>;
  /** Admin/initial stocking -- sets onHand directly, does not touch reserved. */
  setStock(skuId: string, onHand: number): Promise<void>;
  /**
   * Increments reserved. Deliberately never throws on insufficient
   * available stock -- the default adapter allows oversell/backorder,
   * matching a made-to-order shop. See this story's design decisions.
   */
  reserve(skuId: string, quantity: number): Promise<void>;
  /** Fulfillment: decrements BOTH onHand and reserved -- the reservation is being consumed. */
  commit(skuId: string, quantity: number): Promise<void>;
  /** Abandons a reservation: decrements reserved only, restoring availability. */
  release(skuId: string, quantity: number): Promise<void>;
}

/**
 * The narrowest read dependency this package has on order data -- a
 * structural interface, not an import of @mercatus-liber/checkout-orders.
 * @mercatus-liber/checkout-orders' CheckoutOrdersService satisfies this
 * shape already (getOrder returns an object with at least these fields).
 */
export interface OrderLookup {
  getOrder(id: string): Promise<{ id: string; items: { skuId: string; quantity: number }[] } | null>;
}
