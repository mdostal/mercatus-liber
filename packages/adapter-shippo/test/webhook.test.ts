import { describe, expect, it } from "vitest";
import { ShippoWebhookPayloadParseError, shippoTrackingUpdateFrom } from "../src/webhook.js";
import { shippoTrackUpdated } from "./webhook-fixtures.js";

describe("shippoTrackingUpdateFrom", () => {
  it("reads DELIVERED as delivered, linked by the transaction id, and leaves the carrier alone", () => {
    expect(shippoTrackingUpdateFrom(shippoTrackUpdated("DELIVERED"))).toEqual({ externalOrderId: "tx-0001", status: "delivered", trackingNumber: "TRACK-0001", carrier: null });
  });

  it("reads TRANSIT, RETURNED and FAILURE as shipped", () => {
    for (const status of ["TRANSIT", "RETURNED", "FAILURE"]) {
      expect(shippoTrackingUpdateFrom(shippoTrackUpdated(status))).toMatchObject({ externalOrderId: "tx-0001", status: "shipped" });
    }
  });

  it("gives null for PRE_TRANSIT, UNKNOWN and a status it doesn't know", () => {
    for (const status of ["PRE_TRANSIT", "UNKNOWN", "SOMETHING_NEW"]) {
      expect(shippoTrackingUpdateFrom(shippoTrackUpdated(status))).toBeNull();
    }
  });

  it("falls back to the tracking number when the body has no transaction", () => {
    expect(shippoTrackingUpdateFrom(shippoTrackUpdated("DELIVERED", { transaction: null }))).toMatchObject({ externalOrderId: "TRACK-0001", trackingNumber: "TRACK-0001" });
    expect(shippoTrackingUpdateFrom(shippoTrackUpdated("DELIVERED", { transaction: "" }))).toMatchObject({ externalOrderId: "TRACK-0001" });
  });

  it("accepts the raw body as a string or a Buffer", () => {
    const raw = JSON.stringify(shippoTrackUpdated("DELIVERED"));
    expect(shippoTrackingUpdateFrom(raw)).toMatchObject({ status: "delivered" });
    expect(shippoTrackingUpdateFrom(Buffer.from(raw))).toMatchObject({ status: "delivered" });
  });

  it("gives null for other events and bodies without a tracking number or status", () => {
    expect(shippoTrackingUpdateFrom({ ...shippoTrackUpdated("DELIVERED"), event: "transaction_created" })).toBeNull();
    expect(shippoTrackingUpdateFrom(shippoTrackUpdated("DELIVERED", { trackingNumber: "" }))).toBeNull();
    expect(shippoTrackingUpdateFrom({ event: "track_updated", data: { tracking_number: "T", tracking_status: null } })).toBeNull();
    expect(shippoTrackingUpdateFrom({ event: "track_updated" })).toBeNull();
    expect(shippoTrackingUpdateFrom(null)).toBeNull();
    expect(shippoTrackingUpdateFrom("[]")).toBeNull();
  });

  it("throws a parse error for a raw body that isn't JSON", () => {
    expect(() => shippoTrackingUpdateFrom("not json")).toThrow(ShippoWebhookPayloadParseError);
  });
});
