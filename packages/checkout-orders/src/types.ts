import type { LineCustomization, Money } from "@mercatus-liber/core";

export interface OrderLineItem {
  skuId: string;
  quantity: number;
  priceAtPurchase: Money;
  /**
   * Carried straight through from the cart line's own optional
   * customizationNote (see @mercatus-liber/cart's CartItem doc comment) --
   * additive/optional, same pattern as discountTotal/appliedPromotionCode
   * above. Populated by startCheckout directly from CartLookup's cart-item
   * data, never computed here.
   */
  customizationNote?: string;
  /** What the shopper chose for a made-to-order line, including any choices to handle by hand. See LineCustomization. */
  customization?: LineCustomization;
}

/**
 * "abandoned": the payment session expired before the shopper paid. The
 * order can still become "paid" (through a recovery link, or by checking out
 * the same cart again, which restarts it).
 */
export type OrderStatus = "pending_payment" | "abandoned" | "paid" | "fulfilled" | "cancelled";

/** What's known about a checkout the shopper left without paying. */
export interface OrderAbandonment {
  /** When the payment session expired (ISO 8601). */
  at: string;
  /** The email the payment page collected or was prefilled with. */
  email: string | null;
  /** True only when the shopper agreed to marketing email on the payment page. */
  promotionalConsent: boolean;
  /** Reopens the checkout as a new payment session, when the provider made one. */
  recoveryUrl: string | null;
  recoveryExpiresAt: string | null;
}

export interface ShippingInfo {
  name: string;
  email: string;
  address: string;
  /**
   * Structured address fields, additive alongside the free-text `address`
   * above. Added for the dropship-merch-address-wiring subsystem (epic 82,
   * story dp-01): real third-party dropship/print-on-demand order APIs
   * (Printful, Printify -- epics 42/43) need structured fields (street
   * lines, city, state/region code, postal code, ISO country code) for
   * reliable label generation, not a free-text blob to parse.
   *
   * Follows the same additive-field discipline this interface's sibling
   * `Order.discountTotal`/`appliedPromotionCode` fields established, adapted
   * to this shape's own constraints: those two are system-COMPUTED fields
   * with a sensible zero/null default any pre-existing order can be
   * backfilled with, so they're declared required-but-nullable. These
   * fields have no such default -- nobody can compute a shopper's street
   * address -- so they're declared OPTIONAL (`?:`) instead of
   * required-nullable: every existing real `ShippingInfo` construction site
   * in this repo (startCheckout call sites, seed/test fixtures) keeps
   * compiling and passing with zero changes, exactly as it did before these
   * fields existed, until a caller actually starts collecting structured
   * address data. `address` itself is untouched and not deprecated -- both
   * shapes co-exist; nothing here requires removing the free-text blob.
   */
  street1?: string;
  /** Apartment/suite/unit line. Optional -- many real addresses don't need one. */
  street2?: string;
  city?: string;
  /** State/province/region code, e.g. "CA". A name typed into a form may land here too; fulfillment adapters convert it. */
  stateCode?: string;
  /** The region's name, e.g. "California", when known. */
  stateName?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US". */
  countryCode?: string;
  phone?: string;
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
   * Shipping charged on this order, from the ShippingQuoter at checkout.
   * Optional and additive: absent on orders placed before shipping was charged,
   * or by a deployment with no quoter. The amount paid is the items' total plus this.
   */
  shippingTotal?: Money | null;
  /**
   * Set when the payment session expired unpaid (status "abandoned"). Kept
   * after a later payment, so recovered orders can be counted.
   */
  abandonment?: OrderAbandonment;
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
  getCart(
    id: string,
  ): Promise<{ items: { skuId: string; quantity: number; priceSnapshot: Money; customizationNote?: string; customization?: LineCustomization }[] } | null>;
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
    /** Charged on top of the line items, shown to the shopper as shipping. */
    shipping?: ShippingCharge;
    /** Have the payment page collect the shipping address. See StartCheckoutInput.collectAddress. */
    collectShippingAddress?: { allowedCountries: string[]; phone?: boolean };
    /** Prefill the shopper's email on the payment page. */
    customerEmail?: string;
  }): Promise<{ sessionId: string; redirectUrl: string }>;
}

/**
 * The payload of payments.payment.succeeded that checkout-orders reads.
 * @mercatus-liber/payments' PaymentEvent has this shape.
 */
export interface PaymentSucceededPayload {
  sessionId: string;
  orderRef: string | null;
  customer?: { name: string | null; email: string | null; phone: string | null };
  shippingAddress?: { name: string | null; line1: string; line2: string | null; city: string; state: string | null; postalCode: string; countryCode: string };
  /** The expired session this one was recovered from, when paid through a recovery link. */
  recoveredFromSessionId?: string;
}

/**
 * The payload of payments.payment.expired that checkout-orders reads.
 * @mercatus-liber/payments' PaymentExpiredEvent has this shape.
 */
export interface PaymentExpiredPayload {
  sessionId: string;
  orderRef: string | null;
  email: string | null;
  promotionalConsent: boolean;
  recoveryUrl: string | null;
  recoveryExpiresAt?: string | null;
  expiredAt?: string;
}

/**
 * The payload of checkout.order.abandoned, published once when an order's
 * payment session expires unpaid. Send at most one reminder, and only when
 * `canRemind` is true: the shopper agreed to marketing email and there's an
 * address and a link to send.
 */
export interface OrderAbandonedEvent {
  orderId: string;
  email: string | null;
  promotionalConsent: boolean;
  recoveryUrl: string | null;
  recoveryExpiresAt: string | null;
  canRemind: boolean;
}

/** Thrown when checkout is asked to have the payment page collect the address but no country to ship to is known. */
export class NoShippingCountryError extends Error {
  constructor() {
    super("Pass collectAddress.allowedCountries, or shippingInfo.countryCode, so the payment page knows where it may ship.");
    this.name = "NoShippingCountryError";
  }
}

/** A shipping charge: what the shopper sees it called, and how much. */
export interface ShippingCharge {
  label: string;
  amount: Money;
}

/**
 * Prices shipping for an order at checkout. Optional: without one, no shipping
 * is charged (the behavior before this existed). Return null for no charge.
 */
export interface ShippingQuoter {
  quote(input: { items: { skuId: string; quantity: number; unitAmount: Money }[]; shippingInfo: ShippingInfo }): Promise<ShippingCharge | null>;
}

/** Names a line item for the payment page, e.g. "DT Tee (Black, L)". Return null to fall back to the default. */
export type LineItemNamer = (skuId: string) => Promise<string | null>;

/** Post-adjustment cart pricing, computed by a PricingAdjuster from a set of pre-discount line items plus an optional coupon code. */
export interface PricingAdjustment {
  /** post-discount unit price, one entry per input line in the same order: one SKU can have several lines at different prices */
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

/**
 * Reads a SKU and its product's sale window. Optional: with it, checkout
 * refuses lines outside their window (a cart can outlive a sale).
 * @mercatus-liber/catalog's CatalogService has this shape.
 */
export interface SaleWindowLookup {
  getSku(id: string): Promise<{ productId: string; status: string; activeFrom?: string | null; activeTo?: string | null } | null>;
  getProduct?(id: string): Promise<{ activeFrom?: string | null; activeTo?: string | null } | null>;
}

/** Thrown when a cart holds lines that aren't on sale now: not active, not yet open, or ended. */
export class ItemsNotOnSaleError extends Error {
  constructor(readonly skuIds: string[]) {
    super(`These items aren't on sale right now: ${skuIds.join(", ")}`);
    this.name = "ItemsNotOnSaleError";
  }
}

/** Thrown when a cart holds a line that needs a quote, which can't be paid for at its listed price. */
export class QuoteRequiredError extends Error {
  constructor(readonly skuIds: string[]) {
    super(`These items need a quote before they can be purchased: ${skuIds.join(", ")}`);
    this.name = "QuoteRequiredError";
  }
}
