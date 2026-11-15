import { describe, expect, it } from "vitest";
import { createShipStationHttpClient, ShipStationApiError } from "../src/http-client.js";
import { mapTrackingStatusCode, rateTotal } from "../src/mapping.js";
import type { ShipStationRate } from "../src/shipstation-types.js";

/** Fake fetch only; no live ShipStation calls. */
describe("createShipStationHttpClient", () => {
  it("honors baseUrl (trailing slash trimmed) and sends API-Key + JSON content type", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return new Response(JSON.stringify({ approved: true, message: "ok" }), { status: 200 });
    }) as typeof fetch;
    const client = createShipStationHttpClient({ apiKey: "k", baseUrl: "https://mock.example.test/", fetchImpl });

    await client.voidLabel("se-1/2");

    expect(seen[0]!.url).toBe("https://mock.example.test/v2/labels/se-1%2F2/void");
    expect(seen[0]!.init?.headers).toEqual({ "Content-Type": "application/json", "API-Key": "k" });
    expect(seen[0]!.init?.body).toBeUndefined();
  });

  it("wraps a non-JSON error body in ShipStationApiError", async () => {
    const fetchImpl = (async () => new Response("<html>Bad Gateway</html>", { status: 502 })) as unknown as typeof fetch;
    const client = createShipStationHttpClient({ apiKey: "secret-key", fetchImpl });
    const error = await client.listCarriers().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShipStationApiError);
    expect((error as ShipStationApiError).status).toBe(502);
    expect((error as Error).message).toContain("Bad Gateway");
    expect((error as Error).message).not.toContain("secret-key");
  });
});

describe("mapping", () => {
  it("maps every documented tracking status_code", () => {
    expect(["UN", "AC", "IT", "DE", "EX", "AT", "NY", "SP"].map((code) => mapTrackingStatusCode(code as never))).toEqual([
      "unknown",
      "in_transit",
      "in_transit",
      "delivered",
      "exception",
      "exception",
      "in_transit",
      "delivered",
    ]);
    expect(mapTrackingStatusCode(undefined)).toBe("unknown");
  });

  it("sums rate parts in cents and refuses mixed currencies", () => {
    const base = {
      rate_id: "se-1",
      carrier_id: "se-2",
      carrier_code: "ups",
      carrier_friendly_name: "UPS",
      service_type: "Ground",
      service_code: "ups_ground",
      shipping_amount: { currency: "usd", amount: 0.1 },
      insurance_amount: { currency: "usd", amount: 0.2 },
      confirmation_amount: { currency: "usd", amount: 0 },
      other_amount: { currency: "usd", amount: 0 },
    } satisfies ShipStationRate;
    expect(rateTotal(base)).toEqual({ amount: 30, currency: "USD" });
    expect(() => rateTotal({ ...base, other_amount: { currency: "cad", amount: 1 } })).toThrow(/mixes currencies/);
  });
});
