import type { GetRatesInput, LabelPurchaseResult, LabelVoidResult, Parcel, RateQuoteResult, ShippingAdapter, ShippingAddress, ShippingLabel } from "./types.js";

/**
 * Buying a shipping label for an order the store ships itself (sunglasses, a
 * 3D print from the store's own printer, anything not sent to a print-on-
 * demand provider), and recording the tracking number on those order lines.
 *
 * This package does not depend on @mercatus-liber/fulfillment. The two narrow
 * interfaces below are structural, so a store passes its fulfillment service
 * (or anything else) in. `orderShipToAddress()` turns the shipping info that
 * checkout-orders and fulfillment's OrderLookup already carry into an address.
 */

/** The shipping info an order carries, as checkout-orders' ShippingInfo and fulfillment's OrderLookup shape it. */
export interface OrderShippingInfo {
  name: string;
  address: string;
  street1?: string;
  street2?: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
}

/** Finds an order's ship-to details. Fulfillment's `OrderLookup` already satisfies this. */
export interface OrderShipToLookup {
  getOrder(id: string): Promise<{ id: string; shippingInfo?: OrderShippingInfo } | null>;
}

/** Records that order lines left with a tracking number. Fulfillment's `markLineShipped` fits this, one sku at a time. */
export interface ShipmentRecorder {
  markLineShipped(orderId: string, skuId: string, tracking: { trackingNumber: string; trackingUrl: string | null }): Promise<unknown>;
  /**
   * Called once per bought label, after every line was marked shipped, with
   * the whole parcel: the place to announce the shipment (fulfillment's
   * `recordSelfShipment` publishes `fulfillment.order.status_changed` from
   * here). `markLineShipped` alone can't do that, because it sees one line at
   * a time and neither the carrier nor the label id.
   */
  labelRecorded?(shipment: { orderId: string; skuIds: string[]; label: ShippingLabel }): Promise<unknown>;
  /** Called after the provider accepted a void, with the voided label's id (fulfillment's `recordSelfShipmentVoided` fits). */
  labelVoided?(labelId: string): Promise<unknown>;
}

export type OrderRateQuote = RateQuoteResult | { available: false; reason: string; instructionsUrl: null };

export type OrderLabelPurchase =
  | {
      purchased: true;
      label: ShippingLabel;
      recordedSkuIds: string[];
      /** Set when `recorder.labelRecorded` threw. The label is bought and on the order's lines; only the announcement is missing. */
      labelRecordedError?: unknown;
    }
  | Extract<LabelPurchaseResult, { purchased: false }>;

/** `void`'s result. `labelVoidedError` is set when the label was voided but `recorder.labelVoided` threw. */
export type OrderLabelVoid = LabelVoidResult & { labelVoidedError?: unknown };

export interface OrderLabelService {
  /** Rates from the store's address to the order's ship-to address for one parcel. */
  quote(orderId: string, parcel: Parcel): Promise<OrderRateQuote>;
  /** Buys the quoted rate and records its tracking number on every listed sku of the order. */
  buy(orderId: string, skuIds: string[], rateId: string): Promise<OrderLabelPurchase>;
  /** Voids an unused label, then tells the recorder. Not available when the adapter can't void. */
  void(labelId: string): Promise<OrderLabelVoid>;
}

/** Thrown when a label was bought but recording the tracking failed and the label could not be voided either. */
export class LabelRecordedPartiallyError extends Error {
  constructor(
    public readonly label: ShippingLabel,
    public readonly recordedSkuIds: string[],
    public readonly cause: unknown,
    public readonly voidResult: LabelVoidResult | null,
  ) {
    super(
      `Bought label ${label.trackingNumber} (${label.carrier}) but recording it on the order failed after ${recordedSkuIds.length} line(s); ` +
        (voidResult?.voided ? "the label was voided." : "the label was NOT voided, so void it in the carrier dashboard or record it by hand."),
    );
    this.name = "LabelRecordedPartiallyError";
  }
}

/** The order's ship-to address, or why it can't be used for a label (a free-text address alone isn't enough). */
export function orderShipToAddress(info: OrderShippingInfo | undefined): ShippingAddress | { missing: string[] } {
  if (!info) return { missing: ["shippingInfo"] };
  const missing: string[] = (["name", "street1", "city", "stateCode", "postalCode", "countryCode"] as const).filter((k) => !info[k]?.trim());
  if (missing.length > 0) return { missing };
  return {
    name: info.name.trim(),
    street1: info.street1!.trim(),
    street2: info.street2?.trim() || null,
    city: info.city!.trim(),
    state: info.stateCode!.trim(),
    postalCode: info.postalCode!.trim(),
    country: info.countryCode!.trim().toUpperCase(),
    phone: info.phone?.trim() || null,
  };
}

export function createOrderLabelService(deps: {
  adapter: ShippingAdapter;
  /** The address labels ship from (the store's own). */
  fromAddress: ShippingAddress;
  orders: OrderShipToLookup;
  recorder: ShipmentRecorder;
}): OrderLabelService {
  const { adapter, fromAddress, orders, recorder } = deps;

  return {
    async quote(orderId, parcel) {
      const order = await orders.getOrder(orderId);
      if (!order) return { available: false, reason: `Order ${orderId} was not found.`, instructionsUrl: null };
      const toAddress = orderShipToAddress(order.shippingInfo);
      if ("missing" in toAddress) {
        return { available: false, reason: `Order ${orderId} has no complete ship-to address (missing: ${toAddress.missing.join(", ")}).`, instructionsUrl: null };
      }
      const input: GetRatesInput = { fromAddress, toAddress, parcel };
      return adapter.getRates(input);
    },

    async buy(orderId, skuIds, rateId) {
      if (skuIds.length === 0) throw new Error("buy: name at least one order line (sku) the label covers.");
      const result = await adapter.buyLabel(rateId);
      if (!result.purchased) return result;

      const { label } = result;
      const recorded: string[] = [];
      try {
        for (const skuId of skuIds) {
          await recorder.markLineShipped(orderId, skuId, { trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl });
          recorded.push(skuId);
        }
      } catch (err) {
        // A paid label nobody can find is the worst outcome, so try to void it before giving up.
        let voidResult: LabelVoidResult | null = null;
        if (recorded.length === 0 && label.labelId && adapter.voidLabel) {
          voidResult = await adapter.voidLabel(label.labelId).catch(() => null);
        }
        throw new LabelRecordedPartiallyError(label, recorded, err, voidResult);
      }
      // The label is paid for and on the order by now. A failed announcement must not look like a failed purchase, or the caller buys a second label.
      try {
        await recorder.labelRecorded?.({ orderId, skuIds: recorded, label });
      } catch (err) {
        return { purchased: true, label, recordedSkuIds: recorded, labelRecordedError: err };
      }
      return { purchased: true, label, recordedSkuIds: recorded };
    },

    async void(labelId) {
      if (!adapter.voidLabel) return { voided: false, reason: "This shipping provider can't void labels here; void it in the provider's dashboard." };
      const result = await adapter.voidLabel(labelId);
      if (!result.voided) return result;
      try {
        await recorder.labelVoided?.(labelId);
      } catch (err) {
        return { ...result, labelVoidedError: err };
      }
      return result;
    },
  };
}
