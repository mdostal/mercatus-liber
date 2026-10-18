import type { Money } from "@mercatus-liber/core";

/**
 * A provider key this package's `AccountingSyncRecord.provider` field is
 * keyed by, e.g. `"quickbooks"`. Mirrors `FulfillmentProviderKey`
 * (`@mercatus-liber/fulfillment`'s own doc comment) exactly: an opaque
 * string, never a closed union -- a future second adapter (Xero, named as
 * "the natural second" alongside QuickBooks Online in the real gap-audit
 * finding this epic traces to, `.pHive/planning/epic-backlog.md` row 77)
 * adds its own key with no change here.
 */
export type AccountingSyncProviderKey = string;

/**
 * One line of the order as this subsystem needs to see it to build a real
 * accounting record (an invoice/sales-receipt line) -- a narrower view than
 * checkout-orders' own `OrderLineItem` (no `customizationNote`; an
 * accounting system of record has no field for it and doesn't need one).
 */
export interface SyncableOrderLineItem {
  skuId: string;
  quantity: number;
  priceAtPurchase: Money;
}

/**
 * The narrowest read dependency this package has on order data -- a
 * structural interface, not an import of `@mercatus-liber/checkout-orders`.
 * Field-for-field, this is exactly the subset of checkout-orders' real
 * `Order` (`packages/checkout-orders/src/types.ts`) an accounting sync needs:
 * line items + prices (to build invoice/sales-receipt lines), discountTotal +
 * appliedPromotionCode (so a real accounting record can show the discount
 * actually applied, not just the gross total), customerId (nullable -- guest
 * checkout, same as `Order.customerId` itself), createdAt (the transaction
 * date), and `shippingInfo.name`/`shippingInfo.email` (the minimum a real
 * accounting system needs to identify/create a customer record on). Named
 * and shaped to match `Order`'s own field names exactly (not renamed to
 * "customer") so `@mercatus-liber/checkout-orders`' `CheckoutOrdersService`
 * satisfies this shape already, bare -- no adapter/glue object needed at the
 * app-composition boundary, the same structural-satisfaction discipline
 * `internal-bi`'s `OrderMetricsSource` and `fulfillment`'s `OrderLookup`
 * already establish (see those packages' own `types.ts` doc comments).
 */
export interface SyncableOrder {
  id: string;
  customerId: string | null;
  items: SyncableOrderLineItem[];
  discountTotal: Money;
  appliedPromotionCode: string | null;
  createdAt: string;
  shippingInfo: {
    name: string;
    email: string;
  };
}

export interface OrderLookup {
  getOrder(id: string): Promise<SyncableOrder | null>;
}

/**
 * What a real `AccountingSyncAdapter.syncOrder` call hands back on success --
 * the provider's own id for whatever record it created (e.g. a QuickBooks
 * Online `SalesReceipt.Id`), plus when the sync actually completed. Narrow by
 * design: this package's own `AccountingSyncRecord` (below) is where
 * provider/orderId/status bookkeeping actually lives; a `SyncResult` is just
 * what one successful adapter call returns.
 */
export interface SyncResult {
  /** The provider's own id for the created record, e.g. QuickBooks Online's `SalesReceipt.Id` (a numeric-string id, confirmed via its real Accounting API -- see @mercatus-liber/adapter-quickbooks's own doc comments). */
  externalId: string;
  /** ISO 8601 timestamp of when the provider confirmed the record was created -- stamped by the adapter, not re-derived from the order's own createdAt. */
  syncedAt: string;
}

/**
 * The adapter interface every accounting/ERP provider implements (this
 * epic, `accounting-erp-sync-adapter`) -- the "home" interface this package
 * owns, mirroring `@mercatus-liber/fulfillment`'s `FulfillmentAdapter` and
 * `@mercatus-liber/payments`' `PaymentAdapter` shape exactly: one real,
 * minimal write method (`syncOrder`, mirroring `submitOrder`/
 * `createPaymentSession`), and an optional `handleWebhookEvent` for
 * providers that push async status changes back (QuickBooks Online's real,
 * documented Webhooks -- see adapter-quickbooks's webhook.ts), omitted
 * entirely by a provider with no such mechanism. See
 * `.pHive/epics/accounting-erp-sync-adapter/docs/design-discussion.md` §1 for
 * why this interface lives in its own small package rather than as an
 * extension point on `@mercatus-liber/plugins`' event-bus system.
 */
export interface AccountingSyncAdapter {
  /** Creates (or idempotently returns, if the adapter itself de-dupes by order id -- see adapter-quickbooks's own doc comment) one real accounting record for this order. */
  syncOrder(order: SyncableOrder): Promise<SyncResult>;
  /**
   * Verifies and processes a provider webhook payload. Implementations MUST
   * verify the signature before trusting the payload, same discipline as
   * `FulfillmentAdapter.handleWebhookEvent`/`PaymentAdapter`'s own webhook
   * handling. Omitted entirely by a provider with nothing to push back (none
   * exist yet in this package, but the shape is reserved for parity with
   * every other swappable-adapter contract in this repo).
   */
  handleWebhookEvent?(rawBody: string | Buffer, signature: string): Promise<void>;
}

export type AccountingSyncStatus = "synced" | "failed";

/**
 * This package's own persisted bookkeeping for "did order X ever get synced
 * to the accounting system, and with what result" -- owned entirely by this
 * subsystem, never a field bolted onto checkout-orders' `Order` (mirrors
 * `@mercatus-liber/fulfillment`'s `FulfillmentLineRecord` being its own
 * subsystem's record, not a field on `Order`/`OrderLineItem`, see that
 * package's own doc comment for the precedent this follows). One record per
 * order per provider -- a deployment that later adds a second provider
 * (Xero) would get its own independent record per order, not a shared row.
 */
export interface AccountingSyncRecord {
  orderId: string;
  provider: AccountingSyncProviderKey;
  status: AccountingSyncStatus;
  /** The provider's own id for the created record. null when status is "failed" (nothing was ever created) or the order hasn't synced yet. */
  externalId: string | null;
  /** ISO 8601. null when status is "failed". */
  syncedAt: string | null;
  /** The real error message from the failed adapter call. null when status is "synced". */
  error: string | null;
}

export interface AccountingSyncRepository {
  get(orderId: string): Promise<AccountingSyncRecord | null>;
  save(record: AccountingSyncRecord): Promise<void>;
  list(): Promise<AccountingSyncRecord[]>;
}

export class OrderNotFoundForAccountingSyncError extends Error {
  constructor(orderId: string) {
    super(`Order not found for accounting sync: ${orderId}`);
    this.name = "OrderNotFoundForAccountingSyncError";
  }
}
