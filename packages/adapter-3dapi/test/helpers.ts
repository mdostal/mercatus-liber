import type { DapiOrder, DapiOrderStatus, DapiQuote } from "../src/index.js";

/**
 * A recording fake fetch. Nothing in this suite reaches 3DAPI. Response bodies
 * follow the shapes in 3DAPI's OpenAPI document; they are fixtures, not
 * captures from a live account.
 */
export interface FakeCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
  rawBody: unknown;
}

export type FakeHandler = (call: FakeCall) => Response | undefined;

export function fakeFetch(handler: FakeHandler): { fetchImpl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const rawBody = init?.body;
    const call: FakeCall = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
      rawBody,
    };
    calls.push(call);
    return handler(call) ?? json(404, apiError(404, "not_found", "No fake route."));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function apiError(status: number, code: string, message: string, details: unknown = null): unknown {
  return { status_code: status, error: "Error", code, message, details };
}

export function list<T>(data: T[], next: string | null = null): unknown {
  return { object: "list", data, has_more: next !== null, next_cursor: next };
}

const usd = (amount: number): { amount: number; currency: string } => ({ amount, currency: "usd" });

export const QUOTE_A = "qte_A1";
export const QUOTE_B = "qte_B2";
export const MAT_BLACK = "mat_Black1";
export const MAT_WHITE = "mat_White2";

export function order(overrides: Partial<DapiOrder> & { status?: DapiOrderStatus } = {}): DapiOrder {
  return {
    id: "ord_1",
    object: "order",
    number: "2AP7K2M9X",
    channel: "integrator_wallet",
    status: "paid",
    customer: null,
    shipping_address: { formatted: null, city: null, country: "United Kingdom", country_code: "GB" },
    charges: { paid_by: "you", items: usd(1800), shipping: usd(600), vat: { amount: usd(0), rate: 0, included: false, country: null }, sample_credit: null, total: usd(2400) },
    earnings: null,
    shipping: { tier: "small", carrier: null, tracking_number: null, shipped_at: null },
    customer_notes: null,
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    mode: "wallet",
    checkout: null,
    item_count: 2,
    items: [
      {
        id: "itm_1",
        object: "order_item",
        quote: { id: QUOTE_A, object: "quote", name: "Bracket" },
        materials: [{ id: MAT_BLACK, object: "material", name: "PLA Black" }],
        material_slots: [{ slot: 1, material: { id: MAT_BLACK, object: "material", name: "PLA Black" } }],
        quantity: 2,
        unit_price: usd(900),
        production_unit_price: usd(900),
        extras: [],
        total: usd(1800),
      },
    ],
    refunds: [],
    reference: "order-1",
    ...overrides,
  };
}

export function quote(overrides: Partial<DapiQuote> = {}): DapiQuote {
  return {
    id: QUOTE_A,
    object: "quote",
    name: "Bracket",
    file: { name: "bracket.stl", size_bytes: 3, download_url: "https://files.example/bracket.stl", production_version: null },
    status: "ready",
    price: usd(912),
    failure_reason: null,
    suggested_materials: [{ slot: 1, file_color: null, file_filament_type: null, material: { id: MAT_BLACK, object: "material", name: "PLA Black", custom: false }, match: "approximate" }],
    approval: { status: "not_submitted", reason: null },
    created_at: "2026-11-10T10:00:00Z",
    finished_at: "2026-11-10T10:01:00Z",
    ...overrides,
  };
}
