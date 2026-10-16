/**
 * A provider key a SKU can be routed to. "manual" (see MANUAL_FULFILLMENT_PROVIDER
 * below) is the only key this package's reference implementation ever produces or
 * consumes -- real POD/dropship providers (Printful, Printify -- epics 42/43) add
 * their own keys later without any change here, the same "adapters reference
 * things by an opaque id/key, never a closed union" discipline the routing
 * repository and payments' own provider wiring already follow.
 */
export type FulfillmentProviderKey = string;

/** The permanent, zero-infra default provider -- see manual-adapter.ts and design-discussion.md §1d. */
export const MANUAL_FULFILLMENT_PROVIDER: FulfillmentProviderKey = "manual";

export type FulfillmentLineStatus = "unfulfilled" | "submitted" | "shipped" | "delivered";

/**
 * One provider's fulfillment record for one order line (orderId + skuId pair).
 * Owned entirely by this subsystem -- never a field bolted onto checkout-orders'
 * Order/OrderLineItem, see design-discussion.md §1a. `Order.status` stays the
 * coarse/aggregate status; this is the fine-grained, per-line, per-provider view.
 */
export interface FulfillmentLineRecord {
  orderId: string;
  skuId: string;
  provider: FulfillmentProviderKey;
  /** The provider's own id for this order/line, e.g. a Printful order id. null when there's nothing external to submit to (the manual provider). */
  externalOrderId: string | null;
  status: FulfillmentLineStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

/**
 * The real shipping recipient for an order, structurally mirroring
 * checkout-orders' `ShippingInfo` (not an import of it -- same narrow
 * dependency discipline `OrderLookup` below already follows). Added for the
 * dropship-merch-address-wiring subsystem (epic 82, story dp-01): a real
 * dropship/print-on-demand adapter (Printful, Printify -- epics 42/43)
 * genuinely cannot ship anything without an address, and until this existed
 * neither `OrderLookup.getOrder()` nor `SubmitFulfillmentOrderInput` carried
 * one at all -- see those two call sites below. The structured fields are
 * all optional for the same reason they're optional on `ShippingInfo`
 * itself: no sensible default exists for a street address, so widening this
 * never forces an existing caller to change.
 */
export interface FulfillmentRecipient {
  name: string;
  email: string;
  /** Free-text fallback, carried straight through from ShippingInfo.address. */
  address: string;
  street1?: string;
  street2?: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
}

export interface SubmitFulfillmentOrderInput {
  orderId: string;
  /** Only the lines this call's target provider is responsible for -- FulfillmentService fans an order's lines out to the right adapter per line, see service.ts. */
  items: { skuId: string; quantity: number }[];
  /**
   * The real shipping recipient for this order, when known. Added for
   * dp-01 -- optional for backward compatibility: every existing real
   * construction site of `SubmitFulfillmentOrderInput` (this package's own
   * test suite's fake adapters, `createManualFulfillmentAdapter`, which
   * still ignores it exactly as before) keeps compiling unchanged.
   * `FulfillmentService.submitOrder`'s real call site (service.ts) is what
   * actually populates this now, read straight off `OrderLookup.getOrder()`'s
   * own `shippingInfo` field below -- previously dead/unreachable data (no
   * address ever reached this contract at all), now real.
   */
  recipient?: FulfillmentRecipient;
}

/**
 * The adapter interface every fulfillment provider implements (subsystem 41).
 * Mirrors @mercatus-liber/payments' PaymentAdapter shape exactly (see
 * packages/payments/src/types.ts and design-discussion.md §1b):
 * submitOrder/getOrderStatus mirror createPaymentSession/confirmPayment, and
 * handleWebhookEvent is optional for the same reason PaymentAdapter's is
 * required-but-provider-specific -- not every provider (e.g. the manual
 * provider, which has no external system) has anything to verify/process.
 */
export interface FulfillmentAdapter {
  /** Creates one FulfillmentLineRecord per submitted line. */
  submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]>;
  /** Reads back this provider's current records for an order (whatever this adapter itself submitted -- see manual-adapter.ts). */
  getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]>;
  /**
   * Verifies and processes a provider webhook payload (order/shipment status
   * pushed asynchronously). Implementations MUST verify the signature before
   * trusting the payload, same discipline as PaymentAdapter's. Omitted
   * entirely by providers with no external system to receive webhooks from
   * (the manual provider).
   */
  handleWebhookEvent?(rawBody: string | Buffer, signature: string): Promise<void>;
}

/**
 * The narrowest read dependency this package has on order data -- a
 * structural interface, not an import of @mercatus-liber/checkout-orders.
 * checkout-orders' CheckoutOrdersService.getOrder satisfies this shape
 * already (Order carries id + items, items carry skuId + quantity -- see
 * fulfillment-01's real type-compatibility proof in
 * test/order-lookup-compat.test.ts and the compile-time proof in
 * order-lookup-compat.ts). Mirrors internal-bi's own OrderMetricsSource
 * pattern exactly (packages/internal-bi/src/types.ts).
 *
 * `shippingInfo` added for dp-01 (epic 82): structurally matches
 * checkout-orders' real `Order.shippingInfo` field name and shape exactly
 * (field-for-field, including its own additive optional structured-address
 * fields) so `CheckoutOrdersService` keeps satisfying this interface with
 * zero adapter/glue code -- the same "bare `return service;` fails to
 * compile if the shapes ever diverge" proof order-lookup-compat.ts already
 * relies on. Declared optional here (on top of its sub-fields also being
 * optional) so an `OrderLookup` implementer with no shipping-address concept
 * at all -- e.g. this package's own test fakes, which construct `{ id,
 * items }` literals with nothing else -- keeps compiling unchanged.
 */
export interface OrderLookup {
  getOrder(id: string): Promise<{
    id: string;
    items: { skuId: string; quantity: number }[];
    shippingInfo?: {
      name: string;
      email: string;
      address: string;
      street1?: string;
      street2?: string;
      city?: string;
      stateCode?: string;
      postalCode?: string;
      countryCode?: string;
      phone?: string;
    };
  } | null>;
}

export class FulfillmentLineNotFoundError extends Error {
  constructor(orderId: string, skuId: string) {
    super(`No fulfillment line record for order ${orderId}, sku ${skuId}`);
    this.name = "FulfillmentLineNotFoundError";
  }
}
