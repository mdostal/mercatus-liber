import type { GetRatesInput, ShippingAddress } from "@mercatus-liber/shipping";
import { describe, expect, it } from "vitest";
import { createShippoShippingAdapter, SHIPPO_DASHBOARD_URL } from "../src/index.js";
import type { ShippoHttpClient } from "../src/http-client.js";
import { assertShippoAdapterSatisfiesShippingAdapter } from "../src/shipping-adapter-compat.js";
import type { ShippoShipmentResponse, ShippoTrackingResponse, ShippoTransactionResponse } from "../src/shippo-types.js";

/**
 * Every response fixture below is shaped exactly like Shippo's real,
 * documented API responses confirmed during this story's research (see
 * ../src/shippo-types.ts's top doc comment) -- not invented shapes. No live
 * Shippo account/token exists in this environment (design-discussion.md's
 * "Real credential gate", same disclosed pattern as epics 27/42/43/46).
 */
function fakeClient(overrides: Partial<ShippoHttpClient> = {}): ShippoHttpClient & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createShipment: [], createTransaction: [], getTrackingStatus: [] };
  return {
    calls,
    async createShipment(body) {
      calls.createShipment!.push(body);
      return overrides.createShipment ? overrides.createShipment(body) : successfulShipment();
    },
    async createTransaction(body) {
      calls.createTransaction!.push(body);
      return overrides.createTransaction ? overrides.createTransaction(body) : successfulTransaction();
    },
    async getTrackingStatus(carrier, trackingNumber) {
      calls.getTrackingStatus!.push([carrier, trackingNumber]);
      return overrides.getTrackingStatus ? overrides.getTrackingStatus(carrier, trackingNumber) : null;
    },
  };
}

function successfulShipment(): ShippoShipmentResponse {
  return {
    object_id: "76ca5cbfd24f4b2d96f38ea6834985be",
    status: "SUCCESS",
    rates: [
      {
        object_id: "eab0f0c5689347439a9b87f2380710e5",
        amount: "24.30",
        currency: "USD",
        provider: "USPS",
        servicelevel: { name: "Priority Mail Express", token: "usps_priority_express" },
        estimated_days: 2,
      },
      {
        object_id: "b1a1b1c1d1e1f1a1b1c1d1e1f1a1b1c1",
        amount: "8.15",
        currency: "USD",
        provider: "UPS",
        servicelevel: { name: "UPS Ground", token: "ups_ground" },
        estimated_days: null,
      },
    ],
  };
}

function successfulTransaction(): ShippoTransactionResponse {
  return {
    object_id: "2db03e1bc677420a8c56dc77a60e9386",
    status: "SUCCESS",
    tracking_number: "92701901755477000000000011",
    tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=92701901755477000000000011",
    label_url: "https://deliver.goshippo.com/2db03e1bc677420a8c56dc77a60e9386.pdf?Expires=1702641466",
    rate: { object_id: "eab0f0c5689347439a9b87f2380710e5", provider: "USPS" },
  };
}

const fromAddress: ShippingAddress = { name: "Mr. Hippo", street1: "215 Clayton St.", city: "San Francisco", state: "CA", postalCode: "94117", country: "US" };
const toAddress: ShippingAddress = { name: "Mrs. Hippo", street1: "965 Mission St.", city: "San Francisco", state: "CA", postalCode: "94105", country: "US" };
const sampleInput: GetRatesInput = { fromAddress, toAddress, parcel: { weightOz: 32, lengthIn: 5, widthIn: 5, heightIn: 5 } };

describe("createShippoShippingAdapter", () => {
  describe("getRates", () => {
    it("creates a real Shipment (address_from/address_to/parcels/async:false) and maps real rates into ShippingRate[]", async () => {
      const client = fakeClient();
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getRates(sampleInput);

      expect(client.calls.createShipment).toHaveLength(1);
      expect(client.calls.createShipment![0]).toEqual({
        address_from: { name: "Mr. Hippo", street1: "215 Clayton St.", city: "San Francisco", state: "CA", zip: "94117", country: "US" },
        address_to: { name: "Mrs. Hippo", street1: "965 Mission St.", city: "San Francisco", state: "CA", zip: "94105", country: "US" },
        parcels: [{ length: "5", width: "5", height: "5", distance_unit: "in", weight: "32", mass_unit: "oz" }],
        async: false,
      });

      expect(result.available).toBe(true);
      if (!result.available) throw new Error("unreachable");
      expect(result.rates).toEqual([
        { rateId: "eab0f0c5689347439a9b87f2380710e5", carrier: "USPS", serviceLevel: "Priority Mail Express", amount: { amount: 2430, currency: "USD" }, estimatedDays: 2 },
        { rateId: "b1a1b1c1d1e1f1a1b1c1d1e1f1a1b1c1", carrier: "UPS", serviceLevel: "UPS Ground", amount: { amount: 815, currency: "USD" }, estimatedDays: null },
      ]);
    });

    it("honestly reports available:false (never a fabricated empty success) when Shippo returns zero rates for the route", async () => {
      const client = fakeClient({ createShipment: async () => ({ object_id: "s1", status: "SUCCESS", rates: [] }) });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getRates(sampleInput);

      expect(result.available).toBe(false);
      if (result.available) throw new Error("unreachable");
      expect(result.reason).toContain("s1");
      expect(result.instructionsUrl).toBe(SHIPPO_DASHBOARD_URL);
      expect("rates" in result).toBe(false);
    });

    it("honestly reports available:false when the Shipment object itself did not reach SUCCESS", async () => {
      const client = fakeClient({
        createShipment: async () => ({ object_id: "s2", status: "ERROR", rates: [], messages: [{ source: "USPS", code: "bad_address", text: "Address could not be verified." }] }),
      });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getRates(sampleInput);

      expect(result.available).toBe(false);
      if (result.available) throw new Error("unreachable");
      expect(result.reason).toContain("ERROR");
      expect(result.reason).toContain("Address could not be verified.");
    });

    it("throws a clear, honest error (never a fabricated dimension) when the input Parcel is missing real dimensions Shippo's Parcel object requires", async () => {
      const client = fakeClient();
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      await expect(adapter.getRates({ fromAddress, toAddress, parcel: { weightOz: 16 } })).rejects.toThrow(/dimensions/i);
      expect(client.calls.createShipment).toHaveLength(0); // never even calls the live API with a fabricated dimension
    });
  });

  describe("buyLabel", () => {
    it("purchases the rate via a real Transaction (rate/label_file_type/async:false) and maps a SUCCESS response into ShippingLabel", async () => {
      const client = fakeClient();
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.buyLabel("eab0f0c5689347439a9b87f2380710e5");

      expect(client.calls.createTransaction![0]).toEqual({ rate: "eab0f0c5689347439a9b87f2380710e5", label_file_type: "PDF", async: false });
      expect(result.purchased).toBe(true);
      if (!result.purchased) throw new Error("unreachable");
      expect(result.label).toEqual({
        labelUrl: "https://deliver.goshippo.com/2db03e1bc677420a8c56dc77a60e9386.pdf?Expires=1702641466",
        trackingNumber: "92701901755477000000000011",
        trackingUrl: "https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=92701901755477000000000011",
        carrier: "USPS",
      });
    });

    it("honors a custom labelFileType", async () => {
      const client = fakeClient();
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client, labelFileType: "ZPLII" });

      await adapter.buyLabel("rate-1");

      expect(client.calls.createTransaction![0]).toMatchObject({ label_file_type: "ZPLII" });
    });

    it("honestly reports purchased:false (never a fabricated label) for a real non-SUCCESS transaction status, folding Shippo's own messages into reason", async () => {
      const client = fakeClient({
        createTransaction: async () => ({ object_id: "t1", status: "ERROR", messages: [{ source: "UPS", code: "carrier_timeout", text: "UPS API did not respond." }] }),
      });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.buyLabel("rate-does-not-exist");

      expect(result.purchased).toBe(false);
      if (result.purchased) throw new Error("unreachable");
      expect(result.reason).toContain("ERROR");
      expect(result.reason).toContain("UPS API did not respond.");
      expect(result.instructionsUrl).toBe(SHIPPO_DASHBOARD_URL);
      expect("label" in result).toBe(false);
    });

    it("throws rather than fabricate a label when a SUCCESS transaction is missing label_url/tracking_number (a real, disclosed API-consistency guard)", async () => {
      const client = fakeClient({ createTransaction: async () => ({ object_id: "t2", status: "SUCCESS" }) });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      await expect(adapter.buyLabel("rate-1")).rejects.toThrow(/label_url|tracking_number/);
    });

    it("throws rather than fabricate a carrier when a SUCCESS transaction is missing rate.provider", async () => {
      const client = fakeClient({
        createTransaction: async () => ({ object_id: "t3", status: "SUCCESS", label_url: "https://x/y.pdf", tracking_number: "123" }),
      });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      await expect(adapter.buyLabel("rate-1")).rejects.toThrow(/rate\.provider/);
    });
  });

  describe("getTrackingStatus", () => {
    it("detects a UPS-shaped number, calls Shippo's real /tracks/ups/{number} endpoint, and maps a real DELIVERED response", async () => {
      const response: ShippoTrackingResponse = {
        carrier: "ups",
        tracking_number: "1Z999AA10123456784",
        tracking_status: { status: "DELIVERED", status_details: "Delivered to front door.", status_date: "2023-07-23T13:03:00Z", location: { city: "Spotsylvania", state: "VA", zip: "22551", country: "US" } },
        tracking_history: [{ status: "TRANSIT", status_details: "In transit.", status_date: "2023-07-20T10:00:00Z", location: null }],
      };
      const client = fakeClient({ getTrackingStatus: async () => response });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getTrackingStatus("1Z999AA10123456784");

      expect(client.calls.getTrackingStatus![0]).toEqual(["ups", "1Z999AA10123456784"]);
      expect(result.status).toBe("delivered");
      expect(result.lastUpdate).toBe("2023-07-23T13:03:00Z");
      expect(result.detectedCarrier).toBe("UPS");
      expect(result.events).toEqual([{ timestamp: "2023-07-20T10:00:00Z", status: "TRANSIT", description: "In transit.", location: null }]);
    });

    it("maps a real PRE_TRANSIT status to 'in_transit' (this package's closest honest state, see mapping.ts's doc comment)", async () => {
      const response: ShippoTrackingResponse = {
        carrier: "usps",
        tracking_number: "9400111899223197428431",
        tracking_status: { status: "PRE_TRANSIT", status_details: "Label created.", status_date: "2023-07-19T09:00:00Z", location: null },
        tracking_history: [],
      };
      const client = fakeClient({ getTrackingStatus: async () => response });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getTrackingStatus("9400111899223197428431");

      expect(result.status).toBe("in_transit");
    });

    it("maps real RETURNED/FAILURE statuses to 'exception'", async () => {
      const client = fakeClient({
        getTrackingStatus: async () => ({ carrier: "fedex", tracking_number: "999999999999", tracking_status: { status: "RETURNED", status_date: null, location: null }, tracking_history: [] }),
      });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getTrackingStatus("999999999999");

      expect(result.status).toBe("exception");
    });

    it("honestly reports 'unknown' with no live call when the tracking number's carrier can't be confidently detected -- never guesses a carrier to query Shippo with", async () => {
      const client = fakeClient();
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getTrackingStatus("not-a-real-tracking-number");

      expect(result.status).toBe("unknown");
      expect(result.detectedCarrier).toBeNull();
      expect(client.calls.getTrackingStatus).toHaveLength(0);
    });

    it("honestly reports 'unknown' (never throws) when Shippo has no record for a real-shaped but unrecognized number (a real 404)", async () => {
      const client = fakeClient({ getTrackingStatus: async () => null });
      const adapter = createShippoShippingAdapter({ apiToken: "test-token", httpClient: client });

      const result = await adapter.getTrackingStatus("1Z999AA10123456784");

      expect(result.status).toBe("unknown");
      expect(result.detectedCarrier).toBe("UPS");
      expect(result.carrierTrackingUrl).toBe("https://www.ups.com/track?tracknum=1Z999AA10123456784");
    });
  });

  describe("ShippingAdapter contract coverage", () => {
    it("passes the real compile-time type-compatibility proof (shipping-adapter-compat.ts) and exposes all 3 required methods at runtime", () => {
      const client = fakeClient();
      const adapter = assertShippoAdapterSatisfiesShippingAdapter({ apiToken: "test-token", httpClient: client });

      expect(typeof adapter.getRates).toBe("function");
      expect(typeof adapter.buyLabel).toBe("function");
      expect(typeof adapter.getTrackingStatus).toBe("function");
    });
  });
});
