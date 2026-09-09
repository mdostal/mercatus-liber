import { beforeEach, describe, expect, it } from "vitest";
import {
  createManualShippingAdapter,
  detectCarrierFromTrackingNumber,
  PIRATESHIP_URL,
} from "../src/manual-adapter.js";
import type { GetRatesInput, ShippingAdapter } from "../src/types.js";

const sampleFromAddress: GetRatesInput["fromAddress"] = {
  name: "Ada Lovelace",
  street1: "1 Analytical Engine Way",
  city: "London",
  state: "LDN",
  postalCode: "SW1A 1AA",
  country: "GB",
};

const sampleToAddress: GetRatesInput["toAddress"] = {
  name: "Grace Hopper",
  street1: "1 COBOL Court",
  city: "Arlington",
  state: "VA",
  postalCode: "22201",
  country: "US",
};

const sampleInput: GetRatesInput = {
  fromAddress: sampleFromAddress,
  toAddress: sampleToAddress,
  parcel: { weightOz: 16 },
};

describe("createManualShippingAdapter", () => {
  let manual: ShippingAdapter;

  beforeEach(() => {
    manual = createManualShippingAdapter();
  });

  it("getRates never fabricates rate data -- returns an honest not-available result with a real pirateship.com link", async () => {
    const result = await manual.getRates(sampleInput);

    expect(result.available).toBe(false);
    if (result.available) throw new Error("unreachable"); // narrows for TS below
    expect(result.reason).toMatch(/pirate ship/i);
    expect(result.reason).toMatch(/no public api/i);
    expect(result.instructionsUrl).toBe(PIRATESHIP_URL);
    expect(result.instructionsUrl).toBe("https://www.pirateship.com");
  });

  it("getRates result never carries a `rates` field when unavailable (no accidental fabricated array)", async () => {
    const result = await manual.getRates(sampleInput);
    expect("rates" in result).toBe(false);
  });

  it("buyLabel never fabricates label data -- returns an honest not-available result with a real pirateship.com link, for any rateId including a nonsense one", async () => {
    const result = await manual.buyLabel("rate-does-not-exist");

    expect(result.purchased).toBe(false);
    if (result.purchased) throw new Error("unreachable");
    expect(result.reason).toMatch(/pirate ship/i);
    expect(result.instructionsUrl).toBe(PIRATESHIP_URL);
  });

  it("buyLabel result never carries a `label` field when not purchased", async () => {
    const result = await manual.buyLabel("rate-123");
    expect("label" in result).toBe(false);
  });

  it("getRates and buyLabel give the identical honest reason/link regardless of input -- this adapter's answer never depends on data it can't actually see", async () => {
    const ratesA = await manual.getRates(sampleInput);
    const ratesB = await manual.getRates({ ...sampleInput, parcel: { weightOz: 999 } });
    const labelA = await manual.buyLabel("rate-1");
    const labelB = await manual.buyLabel("totally-different-rate-id");

    expect(ratesA).toEqual(ratesB);
    expect(labelA).toEqual(labelB);
  });

  it("getTrackingStatus never fabricates status or events -- always reports 'unknown' with no events, real API integration required for anything more", async () => {
    const status = await manual.getTrackingStatus("1Z999AA10123456784");

    expect(status.status).toBe("unknown");
    expect(status.lastUpdate).toBeNull();
    expect(status.events).toEqual([]);
  });

  it("getTrackingStatus detects a UPS-shaped number and returns a real, working UPS tracking URL", async () => {
    const status = await manual.getTrackingStatus("1Z999AA10123456784");

    expect(status.detectedCarrier).toBe("UPS");
    expect(status.carrierTrackingUrl).toBe(
      "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    );
  });

  it("getTrackingStatus detects a USPS-shaped number and returns a real USPS tracking URL", async () => {
    const status = await manual.getTrackingStatus("9400111899223197428431");

    expect(status.detectedCarrier).toBe("USPS");
    expect(status.carrierTrackingUrl).toContain("tools.usps.com");
  });

  it("getTrackingStatus detects a FedEx-shaped 12-digit number and returns a real FedEx tracking URL", async () => {
    const status = await manual.getTrackingStatus("999999999999");

    expect(status.detectedCarrier).toBe("FedEx");
    expect(status.carrierTrackingUrl).toBe("https://www.fedex.com/fedextrack/?trknbr=999999999999");
  });

  it("getTrackingStatus honestly reports null carrier/url for an unrecognized tracking number format, never throws, never guesses", async () => {
    const status = await manual.getTrackingStatus("not-a-real-tracking-number");

    expect(status.status).toBe("unknown");
    expect(status.detectedCarrier).toBeNull();
    expect(status.carrierTrackingUrl).toBeNull();
  });
});

describe("detectCarrierFromTrackingNumber", () => {
  it("recognizes UPS 1Z-format numbers case-insensitively", () => {
    expect(detectCarrierFromTrackingNumber("1z999aa10123456784")?.carrier).toBe("UPS");
  });

  it("recognizes DHL 10-digit numbers", () => {
    expect(detectCarrierFromTrackingNumber("1234567890")?.carrier).toBe("DHL");
  });

  it("recognizes USPS international-format numbers", () => {
    expect(detectCarrierFromTrackingNumber("EA123456789US")?.carrier).toBe("USPS");
  });

  it("returns null for a string with no recognizable carrier format", () => {
    expect(detectCarrierFromTrackingNumber("abc")).toBeNull();
    expect(detectCarrierFromTrackingNumber("")).toBeNull();
  });

  it("trims incidental whitespace before matching", () => {
    expect(detectCarrierFromTrackingNumber("  1234567890  ")?.carrier).toBe("DHL");
  });
});

describe("ShippingAdapter contract shape", () => {
  it("createManualShippingAdapter() satisfies the real ShippingAdapter interface -- a compile-time proof, not just a runtime check", () => {
    const adapter: ShippingAdapter = createManualShippingAdapter();
    expect(typeof adapter.getRates).toBe("function");
    expect(typeof adapter.buyLabel).toBe("function");
    expect(typeof adapter.getTrackingStatus).toBe("function");
  });
});
