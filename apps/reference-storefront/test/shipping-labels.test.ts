import { describe, expect, it } from "vitest";
import { parcelFromForm, shipFromAddressFromEnv, voidableLabelIds } from "../lib/shipping-labels";

const ENV = { SHIP_FROM_NAME: "Demo Store", SHIP_FROM_STREET1: "215 Clayton St.", SHIP_FROM_CITY: "San Francisco", SHIP_FROM_STATE: "CA", SHIP_FROM_POSTAL_CODE: "94117", SHIP_FROM_EMAIL: "ship@store.example" };

describe("shipFromAddressFromEnv", () => {
  it("builds the address, defaulting the country to US", () => {
    expect(shipFromAddressFromEnv(ENV)).toEqual({ address: { name: "Demo Store", street1: "215 Clayton St.", city: "San Francisco", state: "CA", postalCode: "94117", country: "US", email: "ship@store.example" } });
    expect(shipFromAddressFromEnv({ ...ENV, SHIP_FROM_COUNTRY: "ca", SHIP_FROM_PHONE: " +1 555 0100 ", SHIP_FROM_STREET2: "Unit 2" })).toMatchObject({ address: { country: "CA", phone: "+1 555 0100", street2: "Unit 2" } });
  });

  it("names every missing variable, the sender email included", () => {
    expect(shipFromAddressFromEnv({})).toEqual({ missing: ["SHIP_FROM_NAME", "SHIP_FROM_STREET1", "SHIP_FROM_CITY", "SHIP_FROM_STATE", "SHIP_FROM_POSTAL_CODE", "SHIP_FROM_EMAIL"] });
    expect(shipFromAddressFromEnv({ ...ENV, SHIP_FROM_EMAIL: "  " })).toEqual({ missing: ["SHIP_FROM_EMAIL"] });
  });
});

describe("parcelFromForm", () => {
  it("reads a parcel and refuses missing, zero or absurd numbers", () => {
    expect(parcelFromForm({ weightOz: "12", lengthIn: "8", widthIn: "6", heightIn: "4" })).toEqual({ parcel: { weightOz: 12, lengthIn: 8, widthIn: 6, heightIn: 4 } });
    expect(parcelFromForm({ weightOz: "", lengthIn: "8", widthIn: "6", heightIn: "4" })).toHaveProperty("error");
    expect(parcelFromForm({ weightOz: "12", lengthIn: "8", widthIn: "0", heightIn: "4" })).toHaveProperty("error");
    expect(parcelFromForm({ weightOz: "abc", lengthIn: "8", widthIn: "6", heightIn: "4" })).toHaveProperty("error");
    expect(parcelFromForm({ weightOz: "5000", lengthIn: "8", widthIn: "6", heightIn: "4" })).toHaveProperty("error");
  });
});

describe("voidableLabelIds", () => {
  it("lists bought labels whose parcel has not been delivered or already voided", () => {
    expect(
      voidableLabelIds([
        { meta: { labelId: "label-1" }, status: "shipped" },
        { meta: { labelId: "label-2" }, status: "delivered" },
        { meta: { labelId: "label-3" }, status: "submitted" },
        { status: "shipped" },
      ]),
    ).toEqual(["label-1"]);
  });
});
