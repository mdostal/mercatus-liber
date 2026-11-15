import type { GetRatesInput, ShippingAddress } from "@mercatus-liber/shipping";
import { describe, expect, it } from "vitest";
import { createShipStationShippingAdapter, SHIPSTATION_APP_URL, SHIPSTATION_RATES_DOCS_URL, ShipStationApiError } from "../src/index.js";
import { assertShipStationAdapterSatisfiesShippingAdapter } from "../src/shipping-adapter-compat.js";

/**
 * Every test drives the adapter through a fake fetch. No live ShipStation
 * account exists. Response bodies follow the shapes in ShipStation's
 * published v2 OpenAPI spec and guides (see ../src/shipstation-types.ts);
 * the rate, label and void examples are adapted from
 * https://docs.shipstation.com/rate-shopping, /create-labels and /void-labels.
 */

const API_KEY = "TEST_fake_key_do_not_log_123";

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(routes: Record<string, Route>): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({
      method,
      url: url.toString(),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return json(404, { request_id: "00000000-0000-0000-0000-000000000000", errors: [{ message: `no fake route for ${method} ${url.pathname}` }] });
    return route(init, url);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const fromAddress: ShippingAddress = {
  name: "ShipStation Team",
  company: "ShipStation",
  street1: "4301 Bull Creek Road",
  city: "Austin",
  state: "TX",
  postalCode: "78731",
  country: "US",
  phone: "222-333-4444",
};
const toAddress: ShippingAddress = {
  name: "The President",
  street1: "1600 Pennsylvania Avenue NW",
  city: "Washington",
  state: "DC",
  postalCode: "20500",
  country: "US",
  phone: "222-333-4444",
};
const input: GetRatesInput = { fromAddress, toAddress, parcel: { weightOz: 6 } };

function rate(overrides: Record<string, unknown> = {}) {
  return {
    rate_id: "se-7766853",
    rate_type: "shipment",
    carrier_id: "se-426451",
    zone: 5,
    package_type: "package",
    shipping_amount: { currency: "usd", amount: 59.07 },
    insurance_amount: { currency: "usd", amount: 0 },
    confirmation_amount: { currency: "usd", amount: 0 },
    other_amount: { currency: "usd", amount: 20.63 },
    delivery_days: 1,
    guaranteed_service: true,
    negotiated_rate: false,
    service_type: "UPS Worldwide Express®",
    service_code: "ups_worldwide_express",
    trackable: true,
    carrier_code: "ups",
    carrier_nickname: "UPS by ShipStation (USD)",
    carrier_friendly_name: "UPS",
    validation_status: "valid",
    warning_messages: [],
    error_messages: [],
    ...overrides,
  };
}

function ratesResponse(rates: unknown[], extra: Record<string, unknown> = {}) {
  return {
    shipment_id: "se-11501596",
    rate_response: { rates, invalid_rates: [], rate_request_id: "se-1224263", shipment_id: "se-11501596", status: "completed", errors: [], ...extra },
  };
}

function completedLabel(overrides: Record<string, unknown> = {}) {
  return {
    label_id: "se-test-2128728",
    status: "completed",
    shipment_id: "se-2128728",
    tracking_number: "9999999999999",
    tracking_url: "https://tools.usps.com/go/TrackConfirmAction.action?tLabels=9999999999999",
    carrier_id: "se-0",
    carrier_code: "stamps_com",
    service_code: "usps_priority_mail",
    label_format: "pdf",
    voided: false,
    label_download: {
      pdf: "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.pdf",
      png: "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.png",
      zpl: "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.zpl",
      href: "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.pdf",
    },
    ...overrides,
  };
}

describe("createShipStationShippingAdapter", () => {
  it("satisfies ShippingAdapter including voidLabel (compile-time proof, exercised at runtime)", () => {
    const adapter = assertShipStationAdapterSatisfiesShippingAdapter({ apiKey: API_KEY, fetchImpl: fakeFetch({}).fetchImpl });
    expect(typeof adapter.voidLabel).toBe("function");
  });

  describe("getRates", () => {
    it("POSTs an inline shipment to /v2/rates with the API-Key header and maps rates (total = shipping + insurance + confirmation + other)", async () => {
      const { fetchImpl, calls } = fakeFetch({ "POST /v2/rates": () => json(200, ratesResponse([rate()])) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });

      const result = await adapter.getRates(input);

      expect(result).toEqual({
        available: true,
        rates: [{ rateId: "se-7766853", carrier: "UPS", serviceLevel: "UPS Worldwide Express®", amount: { amount: 7970, currency: "USD" }, estimatedDays: 1 }],
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("https://api.shipstation.com/v2/rates");
      expect(calls[0]!.headers["API-Key"]).toBe(API_KEY);
      expect(calls[0]!.body).toEqual({
        rate_options: { carrier_ids: ["se-426451"] },
        shipment: {
          validate_address: "no_validation",
          ship_to: {
            name: "The President",
            phone: "222-333-4444",
            address_line1: "1600 Pennsylvania Avenue NW",
            city_locality: "Washington",
            state_province: "DC",
            postal_code: "20500",
            country_code: "US",
            address_residential_indicator: "unknown",
          },
          ship_from: {
            name: "ShipStation Team",
            phone: "222-333-4444",
            company_name: "ShipStation",
            address_line1: "4301 Bull Creek Road",
            city_locality: "Austin",
            state_province: "TX",
            postal_code: "78731",
            country_code: "US",
            address_residential_indicator: "unknown",
          },
          packages: [{ package_code: "package", weight: { value: 6, unit: "ounce" } }],
        },
      });
    });

    it("sends dimensions in inches when all three are given", async () => {
      const { fetchImpl, calls } = fakeFetch({ "POST /v2/rates": () => json(200, ratesResponse([rate()])) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });
      await adapter.getRates({ ...input, parcel: { weightOz: 32, lengthIn: 10, widthIn: 8, heightIn: 4 } });
      expect((calls[0]!.body as { shipment: { packages: unknown[] } }).shipment.packages[0]).toEqual({
        package_code: "package",
        weight: { value: 32, unit: "ounce" },
        dimensions: { unit: "inch", length: 10, width: 8, height: 4 },
      });
    });

    it("lists carriers (all pages) when carrierIds isn't configured, skipping carriers disabled by billing plan or that don't send rates", async () => {
      const { fetchImpl, calls } = fakeFetch({
        "GET /v2/carriers": (_init, url) =>
          url.searchParams.get("page") === "1"
            ? json(200, { carriers: [{ carrier_id: "se-1", send_rates: true }, { carrier_id: "se-2", disabled_by_billing_plan: true }], total: 3, page: 1, pages: 2, links: {} })
            : json(200, { carriers: [{ carrier_id: "se-3", send_rates: false }, { carrier_id: "se-4" }], total: 3, page: 2, pages: 2, links: {} }),
        "POST /v2/rates": () => json(200, ratesResponse([rate()])),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });

      await adapter.getRates(input);

      expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}${new URL(call.url).search}`)).toEqual([
        "GET /v2/carriers?include_extended_details=false&page=1",
        "GET /v2/carriers?include_extended_details=false&page=2",
        "POST /v2/rates",
      ]);
      expect((calls[2]!.body as { rate_options: unknown }).rate_options).toEqual({ carrier_ids: ["se-1", "se-4"] });
    });

    it("returns available:false when the account has no usable carriers, without calling /v2/rates", async () => {
      const { fetchImpl, calls } = fakeFetch({ "GET /v2/carriers": () => json(200, { carriers: [], total: 0, page: 1, pages: 1, links: {} }) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      const result = await adapter.getRates(input);
      expect(result).toMatchObject({ available: false, instructionsUrl: SHIPSTATION_RATES_DOCS_URL });
      expect(calls).toHaveLength(1);
    });

    it("returns available:false with ShipStation's reasons when no rates come back", async () => {
      const { fetchImpl } = fakeFetch({
        "POST /v2/rates": () =>
          json(
            200,
            ratesResponse([], {
              status: "error",
              errors: [{ error_source: "carrier", error_type: "business_rules", error_code: "no_rates_returned", message: "No rates for this route." }],
              invalid_rates: [rate({ error_messages: ["Destination not served"] })],
            }),
          ),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });

      const result = await adapter.getRates(input);

      expect(result.available).toBe(false);
      if (result.available) throw new Error("unreachable");
      expect(result.instructionsUrl).toBe(SHIPSTATION_APP_URL);
      expect(result.reason).toContain("status: error");
      expect(result.reason).toContain("no_rates_returned: No rates for this route.");
      expect(result.reason).toContain("Destination not served");
    });

    it("returns available:false on an HTTP 400 (documented error_response_body)", async () => {
      const { fetchImpl } = fakeFetch({
        "POST /v2/rates": () =>
          json(400, { request_id: "aa3d8e8e-462b-4476-9618-72db7f7b7009", errors: [{ error_source: "shipengine", error_type: "validation", error_code: "invalid_address", message: "Invalid postal code." }] }),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });
      const result = await adapter.getRates(input);
      expect(result).toMatchObject({ available: false });
      if (result.available) throw new Error("unreachable");
      expect(result.reason).toContain("HTTP 400");
      expect(result.reason).toContain("invalid_address: Invalid postal code.");
    });

    it("throws ShipStationApiError on HTTP 401/500 and never puts the API key in the error", async () => {
      for (const status of [401, 500]) {
        const { fetchImpl } = fakeFetch({ "POST /v2/rates": () => json(status, { request_id: "aa3d8e8e-462b-4476-9618-72db7f7b7009", errors: [{ message: "Something went wrong." }] }) });
        const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });
        const error = await adapter.getRates(input).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ShipStationApiError);
        expect((error as ShipStationApiError).status).toBe(status);
        expect((error as Error).message).toContain("aa3d8e8e-462b-4476-9618-72db7f7b7009");
        expect((error as Error).message).not.toContain(API_KEY);
        expect(JSON.stringify(error)).not.toContain(API_KEY);
      }
    });

    it("throws rather than inventing a phone number when one is missing", async () => {
      const { fetchImpl, calls } = fakeFetch({});
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, carrierIds: ["se-426451"] });
      const { phone: _phone, ...noPhone } = toAddress;
      await expect(adapter.getRates({ ...input, toAddress: noPhone })).rejects.toThrow(/requires a phone number/);
      expect(calls).toHaveLength(0);
    });
  });

  describe("buyLabel", () => {
    it("POSTs to /v2/labels/rates/{rate_id} with label_format pdf by default and returns the label with labelId", async () => {
      const { fetchImpl, calls } = fakeFetch({ "POST /v2/labels/rates/se-2128728": () => json(200, completedLabel()) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });

      const result = await adapter.buyLabel("se-2128728");

      expect(result).toEqual({
        purchased: true,
        label: {
          labelUrl: "https://api.shipstation.com/v2/downloads/6/Q2OLdnGaqk-UzkN6pFH0lg/testlabel-202923521.pdf",
          trackingNumber: "9999999999999",
          trackingUrl: "https://tools.usps.com/go/TrackConfirmAction.action?tLabels=9999999999999",
          carrier: "stamps_com",
          labelId: "se-test-2128728",
        },
      });
      expect(calls[0]!.method).toBe("POST");
      expect(calls[0]!.headers["API-Key"]).toBe(API_KEY);
      expect(calls[0]!.body).toEqual({ label_format: "pdf", label_download_type: "url" });
    });

    it("uses the configured labelFormat's download URL", async () => {
      const { fetchImpl, calls } = fakeFetch({ "POST /v2/labels/rates/se-2128728": () => json(200, completedLabel({ label_format: "zpl" })) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl, labelFormat: "zpl" });
      const result = await adapter.buyLabel("se-2128728");
      expect(calls[0]!.body).toEqual({ label_format: "zpl", label_download_type: "url" });
      expect(result.purchased && result.label.labelUrl).toMatch(/\.zpl$/);
    });

    it("returns purchased:false for a label that isn't completed", async () => {
      const { fetchImpl } = fakeFetch({ "POST /v2/labels/rates/se-2128728": () => json(200, completedLabel({ status: "processing", tracking_number: null, label_download: null })) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      const result = await adapter.buyLabel("se-2128728");
      expect(result).toMatchObject({ purchased: false, instructionsUrl: SHIPSTATION_APP_URL });
      if (result.purchased) throw new Error("unreachable");
      expect(result.reason).toContain('"processing"');
    });

    it("returns purchased:false on an HTTP 400 such as insufficient funds", async () => {
      const { fetchImpl } = fakeFetch({
        "POST /v2/labels/rates/se-2128728": () =>
          json(400, { request_id: "aa3d8e8e-462b-4476-9618-72db7f7b7009", errors: [{ error_source: "shipengine", error_type: "funding_sources", error_code: "insufficient_funds", message: "Insufficient funds." }] }),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      const result = await adapter.buyLabel("se-2128728");
      expect(result.purchased).toBe(false);
      if (result.purchased) throw new Error("unreachable");
      expect(result.reason).toContain("insufficient_funds");
    });
  });

  describe("voidLabel", () => {
    it("PUTs /v2/labels/{label_id}/void and reports voided with pending refund on approval", async () => {
      const { fetchImpl, calls } = fakeFetch({
        "PUT /v2/labels/se-421351/void": () => json(200, { approved: true, message: "Request for refund submitted. This label has been voided." }),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });

      expect(await adapter.voidLabel("se-421351")).toEqual({ voided: true, pending: true });
      expect(calls[0]!.method).toBe("PUT");
      expect(calls[0]!.url).toBe("https://api.shipstation.com/v2/labels/se-421351/void");
      expect(calls[0]!.headers["API-Key"]).toBe(API_KEY);
    });

    it("reports voided:false with the carrier message and reason_code when not approved", async () => {
      const { fetchImpl } = fakeFetch({
        "PUT /v2/labels/se-421351/void": () => json(200, { approved: false, message: "Unable to delete FedEx shipment. Unable to retrieve record from database.", reason_code: "label_already_used" }),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      expect(await adapter.voidLabel("se-421351")).toEqual({
        voided: false,
        reason: "ShipStation did not approve voiding label se-421351 (label_already_used): Unable to delete FedEx shipment. Unable to retrieve record from database.",
      });
    });

    it("reports voided:false on HTTP 404 (unknown label)", async () => {
      const { fetchImpl } = fakeFetch({});
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      const result = await adapter.voidLabel("se-missing");
      expect(result.voided).toBe(false);
      if (result.voided) throw new Error("unreachable");
      expect(result.reason).toContain("HTTP 404");
    });

    it("throws on HTTP 500", async () => {
      const { fetchImpl } = fakeFetch({ "PUT /v2/labels/se-421351/void": () => json(500, { request_id: "aa3d8e8e-462b-4476-9618-72db7f7b7009", errors: [{ message: "Internal error" }] }) });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      await expect(adapter.voidLabel("se-421351")).rejects.toBeInstanceOf(ShipStationApiError);
    });
  });

  describe("tracking", () => {
    it("getTrackingStatus(trackingNumber) returns unknown without any API call (v2 needs a carrier code to track by number)", async () => {
      const { fetchImpl, calls } = fakeFetch({});
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      const result = await adapter.getTrackingStatus("1Z932R800390810600");
      expect(result).toMatchObject({ status: "unknown", lastUpdate: null, events: [], detectedCarrier: "UPS" });
      expect(result.carrierTrackingUrl).toContain("1Z932R800390810600");
      expect(calls).toHaveLength(0);
    });

    it("getTrackingStatusForLabel maps GET /v2/labels/{label_id}/track", async () => {
      const { fetchImpl, calls } = fakeFetch({
        "GET /v2/labels/se-324658/track": () =>
          json(200, {
            tracking_number: "1Z932R800390810600",
            status_code: "DE",
            status_description: "Delivered",
            carrier_status_code: "D",
            carrier_status_description: "DELIVERED",
            estimated_delivery_date: "2024-10-27T11:59:03.289Z",
            actual_delivery_date: "2024-10-27T11:59:03.289Z",
            exception_description: null,
            events: [
              { occurred_at: "2024-10-25T12:32:00Z", description: "Arrived at UPS Facility", city_locality: "OCEANSIDE", state_province: "CA", postal_code: "92056", country_code: "", event_code: "U1", status_code: "IT" },
              { occurred_at: "2024-10-27T09:00:00Z", description: "Delivered", city_locality: "SAN DIEGO", state_province: "CA", postal_code: "92101", country_code: "US", event_code: "D", status_code: "DE" },
            ],
          }),
      });
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });

      const result = await adapter.getTrackingStatusForLabel("se-324658");

      expect(calls[0]!.url).toBe("https://api.shipstation.com/v2/labels/se-324658/track");
      expect(result.status).toBe("delivered");
      expect(result.lastUpdate).toBe("2024-10-27T09:00:00Z");
      expect(result.events[0]).toEqual({ timestamp: "2024-10-25T12:32:00Z", status: "IT", description: "Arrived at UPS Facility", location: "OCEANSIDE, CA, 92056" });
    });

    it("getTrackingStatusForLabel returns unknown on 404", async () => {
      const { fetchImpl } = fakeFetch({});
      const adapter = createShipStationShippingAdapter({ apiKey: API_KEY, fetchImpl });
      expect((await adapter.getTrackingStatusForLabel("se-missing")).status).toBe("unknown");
    });
  });
});
