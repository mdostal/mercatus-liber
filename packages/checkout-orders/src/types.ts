import type { Money } from "@mercatus-liber/core";

export interface OrderLineItem {
  skuId: string;
  quantity: number;
  priceAtPurchase: Money;
}

export type OrderStatus = "pending_payment" | "paid" | "fulfilled" | "cancelled";

export interface ShippingInfo {
  name: string;
  email: string;
  address: string;
}

export interface Order {
  id: string;
  cartId: string;
  idempotencyKey: string;
  items: OrderLineItem[];
  status: OrderStatus;
  shippingInfo: ShippingInfo;
  paymentSessionId: string | null;
  paymentRedirectUrl: string | null;
  /** null for guest checkout. Added for the account subsystem (10) -- see acct-01. Backward compatible: existing callers that never pass customerId keep getting null. */
  customerId: string | null;
  /** Sum of the per-line discount applied at checkout time. Added for the promotions subsystem (16) -- see promo-02. Backward compatible: zero (default currency-matched Money) for every order created before a PricingAdjuster was wired, or when the adjustment applied no discount. */
  discountTotal: Money;
  /** The coupon code applied to this order, if any. Added for the promotions subsystem (16) -- see promo-02. Backward compatible: null for every order created before a PricingAdjuster was wired, or when no code was applied. */
  appliedPromotionCode: string | null;
  /**
   * ISO 8601 timestamp of when this order was created. Added for the internal-bi
   * subsystem (20) -- see bi-01. Unlike discountTotal/appliedPromotionCode above,
   * this is a REQUIRED field, not nullable/optional with a default: a timestamp has
   * no sensible "unknown" default the way a zero discount or null promotion code
   * does. This is a deliberate departure from the nullable-default pattern used for
   * those two prior additions. Safe because Order is constructed fresh in exactly
   * one place (startCheckout) and this reference implementation has no
   * persisted-across-versions data to migrate. Set once at construction and never
   * re-stamped on subsequent updates (e.g. the idempotent-retry path, or the
   * payment-session/status updates below).
   */
  createdAt: string;
}

export interface OrderRepository {
  get(id: string): Promise<Order | null>;
  getByIdempotencyKey(key: string): Promise<Order | null>;
  listByCustomerId(customerId: string): Promise<Order[]>;
  /** Every order regardless of customer, guest or not -- the admin-view read path. */
  listAll(filter?: { status?: OrderStatus }): Promise<Order[]>;
  save(order: Order): Promise<void>;
}

/**
 * The narrowest read dependency checkout-orders has on cart data -- a structural
 * interface, not an import of @mercatus-liber/cart. @mercatus-liber/cart's
 * CartService satisfies this shape already.
 */
export interface CartLookup {
  getCart(id: string): Promise<{ items: { skuId: string; quantity: number; priceSnapshot: Money }[] } | null>;
}

/**
 * The narrowest write dependency checkout-orders has on payments -- a structural
 * interface, not an import of @mercatus-liber/payments. Starting checkout is a
 * synchronous user action needing an immediate session/redirect, so this is a
 * direct call (unlike payment *confirmation*, which arrives asynchronously via
 * the payments.payment.succeeded event -- see the service's event subscription).
 */
export interface PaymentSessionCreator {
  createPaymentSession(input: {
    orderRef: string;
    lineItems: { name: string; unitAmount: Money; quantity: number }[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; redirectUrl: string }>;
}

/** Post-adjustment cart pricing, computed by a PricingAdjuster from a set of pre-discount line items plus an optional coupon code. */
export interface PricingAdjustment {
  /** post-discount unit price */
  items: { skuId: string; quantity: number; unitAmount: Money }[];
  discountTotal: Money;
  /** sum(items[].unitAmount * quantity) */
  total: Money;
  appliedCode: string | null;
}

/**
 * The narrowest dependency checkout-orders has on pricing adjustments -- a
 * structural interface, not an import of @mercatus-liber/promotions.
 * @mercatus-liber/promotions's PromotionsService satisfies this shape.
 * Optional: when no PricingAdjuster is wired at services.ts DI time,
 * startCheckout/previewCheckout fall through to a pass-through adjustment
 * (zero discount, unitAmount === priceSnapshot) -- zero behavior change for
 * any deployment that hasn't adopted promotions yet.
 */
export interface PricingAdjuster {
  computeAdjustment(input: {
    items: { skuId: string; quantity: number; priceSnapshot: Money }[];
    couponCode?: string | null;
  }): Promise<PricingAdjustment>;
  /**
   * Bookkeeping only, not part of computeAdjustment's pure computation: called
   * by startCheckout right after order.save() succeeds, only when the
   * adjustment carried a non-null appliedCode and this method is present.
   * Lets a promotions-side implementation track which order redeemed which
   * code (mirrors PromotionsService.recordAppliedPromotion's input shape).
   * Optional because a PricingAdjuster with no redemption bookkeeping to do
   * (or the built-in pass-through) simply omits it.
   */
  recordApplication?(input: { orderId: string; appliedCode: string; discountAmount: Money }): Promise<void>;
}

export class CartNotFoundForCheckoutError extends Error {
  constructor(cartId: string) {
    super(`Cart not found for checkout: ${cartId}`);
    this.name = "CartNotFoundForCheckoutError";
  }
}

export class EmptyCartError extends Error {
  constructor(cartId: string) {
    super(`Cannot check out an empty cart: ${cartId}`);
    this.name = "EmptyCartError";
  }
}

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Order not found: ${id}`);
    this.name = "OrderNotFoundError";
  }
}
