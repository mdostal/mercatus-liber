import { shippoTrackingUpdateFrom } from "@mercatus-liber/adapter-shippo";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryProviderOrderLinkRepository,
  createProviderOrderStatusRecorder,
  FULFILLMENT_ORDER_STATUS_CHANGED,
  recordSelfShipment,
  recordSelfShipmentVoided,
  type FulfillmentOrderStatusChanged,
  type ProviderOrderStatusUpdate,
} from "@mercatus-liber/fulfillment";
import { createOrderLabelService, type ShippingAdapter } from "@mercatus-liber/shipping";
import { describe, expect, it } from "vitest";
import { getServicesForDemo } from "../lib/services";

/**
 * @mercatus-liber/shipping and @mercatus-liber/fulfillment do not depend on
 * each other, so the chain a store builds from both is tested here, where both
 * are installed: buy a label -> recordSelfShipment -> the status event, then a
 * Shippo tracking webhook body -> delivered, and a void -> submitted.
 */
const LABEL = { labelUrl: "https://labels.example/l1.pdf", trackingNumber: "TRACK-0001", trackingUrl: "https://tracking.example/TRACK-0001", carrier: "USPS", labelId: "tx-0001" };

function setup() {
  const links = createInMemoryProviderOrderLinkRepository();
  const events = createInMemoryEventBus();
  const published: FulfillmentOrderStatusChanged[] = [];
  events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
    published.push(payload);
  });
  const recorder = createProviderOrderStatusRecorder({ links, events });
  const adapter: ShippingAdapter = {
    getRates: async () => ({ available: true, rates: [] }),
    buyLabel: async () => ({ purchased: true, label: LABEL }),
    getTrackingStatus: async () => ({ status: "unknown", lastUpdate: null, events: [] }),
    voidLabel: async () => ({ voided: true, pending: true }),
  };
  const labels = createOrderLabelService({
    adapter,
    fromAddress: { name: "The Shop", street1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
    orders: { getOrder: async () => null },
    recorder: {
      markLineShipped: async () => {},
      labelRecorded: ({ orderId, skuIds, label }) => recordSelfShipment({ links, recorder, orderId, skuIds, trackingNumber: label.trackingNumber, carrier: label.carrier, labelId: label.labelId }),
      labelVoided: (labelId) => recordSelfShipmentVoided({ recorder, labelId }),
    },
  });
  return { labels, recorder, published };
}

const trackUpdated = (status: string) => ({ event: "track_updated", test: false, data: { carrier: "usps", tracking_number: "TRACK-0001", transaction: "tx-0001", tracking_status: { status } } });

describe("self-shipped lines and fulfillment.order.status_changed", () => {
  it("a bought label publishes shipped for the manual provider with the label's lines, tracking and carrier", async () => {
    const { labels, published } = setup();
    const bought = await labels.buy("order-1", ["sunglasses-blue", "print-dragon"], "rate-1");
    expect(bought).toEqual({ purchased: true, label: LABEL, recordedSkuIds: ["sunglasses-blue", "print-dragon"] });
    expect(published).toEqual([
      expect.objectContaining({ orderId: "order-1", skuIds: ["sunglasses-blue", "print-dragon"], provider: "manual", externalOrderId: "tx-0001", status: "shipped", trackingNumber: "TRACK-0001", carrier: "USPS", previousStatus: null }),
    ]);
  });

  it("a Shippo tracking webhook body moves that shipment to delivered, without a second shipped", async () => {
    const { labels, recorder, published } = setup();
    await labels.buy("order-1", ["sunglasses-blue"], "rate-1");

    // The mapper's result is passed to the recorder as it is; these annotations are the compile-time check that the shapes match.
    const inTransit: ProviderOrderStatusUpdate | null = shippoTrackingUpdateFrom(trackUpdated("TRANSIT"));
    const delivered: ProviderOrderStatusUpdate | null = shippoTrackingUpdateFrom(JSON.stringify(trackUpdated("DELIVERED")));
    expect(await recorder.record("manual", inTransit!)).toBe("unchanged");
    expect(await recorder.record("manual", delivered!)).toBe("published");

    expect(published.map((p) => p.status)).toEqual(["shipped", "delivered"]);
    expect(published[1]).toMatchObject({ orderId: "order-1", skuIds: ["sunglasses-blue"], trackingNumber: "TRACK-0001", carrier: "USPS", previousStatus: "shipped" });
  });

  it("a voided label publishes a change back to submitted for its lines", async () => {
    const { labels, published } = setup();
    await labels.buy("order-1", ["sunglasses-blue"], "rate-1");
    expect(await labels.void("tx-0001")).toEqual({ voided: true, pending: true });
    expect(published[1]).toMatchObject({ orderId: "order-1", skuIds: ["sunglasses-blue"], provider: "manual", status: "submitted", previousStatus: "shipped" });
  });

  it("the storefront's recordSelfShipment publishes on that demo's event bus", async () => {
    const services = await getServicesForDemo("print-shop");
    const published: FulfillmentOrderStatusChanged[] = [];
    services.events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    expect(await services.recordSelfShipment({ orderId: "order-self-1", skuIds: ["sku-a"], trackingNumber: "TRACK-0002" })).toBe("published");
    expect(published).toEqual([expect.objectContaining({ orderId: "order-self-1", skuIds: ["sku-a"], provider: "manual", externalOrderId: "TRACK-0002", status: "shipped", trackingNumber: "TRACK-0002", carrier: null })]);
  });
});
