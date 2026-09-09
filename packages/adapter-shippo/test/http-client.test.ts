import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShippoHttpClient, ShippoApiError } from "../src/http-client.js";

/**
 * Exercises the real request shapes this adapter sends against a recording
 * fetch fake -- no live Shippo account/token exists in this environment (see
 * design-discussion.md's "Real credential gate"), so every response body
 * here is shaped exactly like Shippo's real, documented API responses
 * confirmed during this story's research (see ../src/shippo-types.ts's top
 * doc comment), not invented.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createShippoHttpClient", () => {
  let calls: { url: string; init: RequestInit | undefined }[];
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchImpl = vi.fn();
  });

  it("createShipment POSTs to the real, confirmed /shipments/ endpoint with the real ShippoToken auth scheme and the exact request body", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, {
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
        ],
      });
    });

    const client = createShippoHttpClient({ apiToken: "shippo_test_abc123", fetchImpl: fetchImpl as unknown as typeof fetch });

    const body = {
      address_from: { name: "Mr. Hippo", street1: "215 Clayton St.", city: "San Francisco", state: "CA", zip: "94117", country: "US" },
      address_to: { name: "Mrs. Hippo", street1: "965 Mission St.", city: "San Francisco", state: "CA", zip: "94105", country: "US" },
      parcels: [{ length: "5", width: "5", height: "5", distance_unit: "in" as const, weight: "2", mass_unit: "lb" as const }],
      async: false as const,
    };
    const result = await client.createShipment(body);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.goshippo.com/shipments/");
    expect(calls[0]!.init?.method).toBe("POST");
    // Confirmed real scheme: "ShippoToken <token>", NOT Bearer.
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "ShippoToken shippo_test_abc123", "Content-Type": "application/json" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual(body);
    expect(result.object_id).toBe("76ca5cbfd24f4b2d96f38ea6834985be");
    expect(result.rates[0]!.provider).toBe("USPS");
  });

  it("createTransaction POSTs to the real, confirmed /transactions/ endpoint with the exact request body", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, {
        object_id: "2db03e1bc677420a8c56dc77a60e9386",
        status: "SUCCESS",
        tracking_number: "92701901755477000000000011",
        tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=92701901755477000000000011",
        label_url: "https://deliver.goshippo.com/2db03e1bc677420a8c56dc77a60e9386.pdf?Expires=1702641466",
        rate: { object_id: "eab0f0c5689347439a9b87f2380710e5", provider: "USPS" },
      });
    });

    const client = createShippoHttpClient({ apiToken: "shippo_test_abc123", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createTransaction({ rate: "eab0f0c5689347439a9b87f2380710e5", label_file_type: "PDF", async: false });

    expect(calls[0]!.url).toBe("https://api.goshippo.com/transactions/");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ rate: "eab0f0c5689347439a9b87f2380710e5", label_file_type: "PDF", async: false });
    expect(result.status).toBe("SUCCESS");
    expect(result.label_url).toContain("goshippo.com");
  });

  it("getTrackingStatus GETs the real, confirmed /tracks/{carrier}/{tracking_number} path with a real ShippoToken header", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, {
        carrier: "usps",
        tracking_number: "9205590164917312751089",
        tracking_status: { status: "DELIVERED", status_details: "Delivered", status_date: "2023-07-23T13:03:00Z", location: { city: "Spotsylvania", state: "VA", zip: "22551", country: "US" } },
        tracking_history: [],
      });
    });

    const client = createShippoHttpClient({ apiToken: "shippo_test_abc123", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getTrackingStatus("usps", "9205590164917312751089");

    expect(calls[0]!.url).toBe("https://api.goshippo.com/tracks/usps/9205590164917312751089");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.headers).toMatchObject({ Authorization: "ShippoToken shippo_test_abc123" });
    expect(result?.tracking_status?.status).toBe("DELIVERED");
  });

  it("getTrackingStatus returns null (not throw) on a real 404 -- an unrecognized tracking number", async () => {
    fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse(404, { detail: "Not found." });
    });
    const client = createShippoHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getTrackingStatus("usps", "not-a-real-number");

    expect(result).toBeNull();
  });

  it("throws ShippoApiError with status and body for a non-404 error response", async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(400, { address_to: ["Invalid postal code."] }));
    const client = createShippoHttpClient({ apiToken: "test-token", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(
      client.createShipment({
        address_from: { name: "A", street1: "1 St", city: "X", state: "CA", zip: "00000", country: "US" },
        address_to: { name: "B", street1: "2 St", city: "Y", state: "CA", zip: "00000", country: "US" },
        parcels: [{ length: "1", width: "1", height: "1", distance_unit: "in", weight: "1", mass_unit: "lb" }],
        async: false,
      }),
    ).rejects.toThrow(ShippoApiError);
  });
});
