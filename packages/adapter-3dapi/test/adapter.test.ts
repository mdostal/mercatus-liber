import { createInMemoryProviderCatalogMappingRepository, InvalidCatalogMappingError, MissingCatalogMappingError } from "@mercatus-liber/fulfillment";
import type { FulfillmentLineRecord, FulfillmentRecipient } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import { assertDapiAdapterSatisfiesFulfillmentAdapter } from "../src/fulfillment-adapter-compat.js";
import {
  createDapiFulfillmentAdapter,
  DAPI_ORDER_STATUSES,
  DAPI_PROVIDER,
  DapiApiError,
  dapiCatalogTargetsFrom,
  dapiReferenceForOrder,
  dapiSkuIdsFrom,
  IncompleteRecipientError,
  mapDapiOrderStatus,
  type DapiCatalogTarget,
  type DapiFulfillmentAdapterConfig,
  type DapiOrder,
} from "../src/index.js";
import { apiError, fakeFetch, json, list, MAT_BLACK, MAT_WHITE, order, QUOTE_A, QUOTE_B, type FakeHandler } from "./helpers.js";

const recipient: FulfillmentRecipient = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  address: "1 Analytical Engine Way, London",
  street1: "1 Analytical Engine Way",
  city: "London",
  postalCode: "SW1A 1AA",
  countryCode: "gb",
  phone: "+44 20 7946 0000",
};

const targets: Record<string, DapiCatalogTarget> = {
  "sku-bracket": { quoteId: QUOTE_A, materials: [MAT_BLACK] },
  "sku-vase": { quoteId: QUOTE_B, useSuggestedMaterials: true, extras: [{ extra: "xtr_Magnet", quantityPerUnit: 4 }] },
};

function setup(handler: FakeHandler, overrides: Partial<DapiFulfillmentAdapterConfig> = {}) {
  const fake = fakeFetch(handler);
  const adapter = createDapiFulfillmentAdapter({
    apiKey: "key-1",
    fetchImpl: fake.fetchImpl,
    resolveCatalogTarget: async (skuId) => {
      const target = targets[skuId];
      if (!target) throw new Error(`no target for ${skuId}`);
      return target;
    },
    ...overrides,
  });
  return { adapter, calls: fake.calls, posts: () => fake.calls.filter((c) => c.method === "POST") };
}

/** A 3DAPI with no orders yet, which creates `created` on POST. */
function emptyThenCreate(created: DapiOrder = order()): FakeHandler {
  return (call) => {
    if (call.method === "GET" && call.url.pathname === "/v2/integrator/orders") return json(200, list([]));
    if (call.method === "POST" && call.url.pathname === "/v2/integrator/orders") return json(201, created);
    return undefined;
  };
}

const items = [
  { skuId: "sku-bracket", quantity: 2 },
  { skuId: "sku-vase", quantity: 1 },
];

describe("submitOrder", () => {
  it("places one wallet order with the spec's request shape and an idempotency key from the order id", async () => {
    const { adapter, calls, posts } = setup(emptyThenCreate());
    const records = await adapter.submitOrder({ orderId: "order-1", items, recipient });

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.searchParams.get("reference")).toBe("order-1");
    expect(posts()).toHaveLength(1);
    const post = posts()[0]!;
    expect(post.url.href).toBe("https://public-api.dapi.digital/v2/integrator/orders");
    expect(post.headers).toMatchObject({ "x-api-key": "key-1", "Idempotency-Key": "mercatus-liber:order:order-1:0", "Content-Type": "application/json" });
    expect(post.body).toEqual({
      mode: "wallet",
      items: [
        { quote: QUOTE_A, quantity: 2, materials: [MAT_BLACK] },
        { quote: QUOTE_B, quantity: 1, use_suggested_materials: true, extras: [{ extra: "xtr_Magnet", quantity_per_unit: 4 }] },
      ],
      shipping_address: { line1: "1 Analytical Engine Way", city: "London", postal_code: "SW1A 1AA", country_code: "GB" },
      customer: { name: "Ada Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000" },
      reference: "order-1",
    });
    expect(records).toEqual<FulfillmentLineRecord[]>([
      { orderId: "order-1", skuId: "sku-bracket", provider: "3dapi", externalOrderId: "ord_1", status: "submitted", trackingNumber: null, trackingUrl: null },
      { orderId: "order-1", skuId: "sku-vase", provider: "3dapi", externalOrderId: "ord_1", status: "submitted", trackingNumber: null, trackingUrl: null },
    ]);
  });

  it("sends the same idempotency key when the same order is submitted again", async () => {
    const { adapter, posts } = setup(emptyThenCreate());
    await adapter.submitOrder({ orderId: "order-1", items, recipient });
    await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect(posts().map((p) => p.headers["Idempotency-Key"])).toEqual(["mercatus-liber:order:order-1:0", "mercatus-liber:order:order-1:0"]);
  });

  it("returns the order 3DAPI already has for the reference instead of ordering again", async () => {
    const { adapter, posts } = setup((call) => (call.method === "GET" ? json(200, list([order({ id: "ord_existing", status: "in_production" })])) : undefined));
    const records = await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect(posts()).toHaveLength(0);
    expect(records.map((r) => [r.skuId, r.externalOrderId, r.status])).toEqual([
      ["sku-bracket", "ord_existing", "submitted"],
      ["sku-vase", "ord_existing", "submitted"],
    ]);
  });

  it("orders again, under a new idempotency key, when the only existing order was cancelled", async () => {
    const { adapter, posts } = setup((call) => {
      if (call.method === "GET") return json(200, list([order({ id: "ord_old", status: "cancelled" })]));
      return json(201, order({ id: "ord_new" }));
    });
    const records = await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect(posts()[0]!.headers["Idempotency-Key"]).toBe("mercatus-liber:order:order-1:1");
    expect(records[0]!.externalOrderId).toBe("ord_new");
  });

  it("after a 5xx, checks for the order again and retries under a new key", async () => {
    let fail = true;
    const { adapter, posts, calls } = setup((call) => {
      if (call.method === "GET") return json(200, list([]));
      if (fail) return json(503, apiError(503, "card_payments_unavailable", "Card payments are not available right now."));
      return json(201, order());
    });
    await expect(adapter.submitOrder({ orderId: "order-1", items, recipient })).rejects.toMatchObject({ status: 503, code: "card_payments_unavailable" });
    fail = false;
    const records = await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect(records[0]!.externalOrderId).toBe("ord_1");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET", "POST"]);
    expect(posts().map((p) => p.headers["Idempotency-Key"])).toEqual(["mercatus-liber:order:order-1:0", "mercatus-liber:order:order-1:0:r1"]);
  });

  it("a refused order (4xx) keeps its key for the corrected retry", async () => {
    const { adapter, posts } = setup((call) => (call.method === "GET" ? json(200, list([])) : json(402, apiError(402, "insufficient_balance", "Short."))));
    await adapter.submitOrder({ orderId: "order-1", items, recipient }).catch(() => undefined);
    await adapter.submitOrder({ orderId: "order-1", items, recipient }).catch(() => undefined);
    expect(posts().map((p) => p.headers["Idempotency-Key"])).toEqual(["mercatus-liber:order:order-1:0", "mercatus-liber:order:order-1:0"]);
  });

  it("holdOrders calls 3DAPI not at all and reports each line held with no external order id", async () => {
    const { adapter, calls } = setup(emptyThenCreate(), { holdOrders: true });
    const records = await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect(calls).toEqual([]);
    expect(records).toEqual<FulfillmentLineRecord[]>([
      { orderId: "order-1", skuId: "sku-bracket", provider: "3dapi", externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null },
      { orderId: "order-1", skuId: "sku-vase", provider: "3dapi", externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null },
    ]);
    // Still held when read back: 3DAPI has no order for the reference.
    expect(await adapter.getOrderStatus("order-1")).toEqual(records);
  });

  it("holdOrders still refuses a bad address and an unmapped SKU", async () => {
    const { adapter, calls } = setup(emptyThenCreate(), { holdOrders: true });
    await expect(adapter.submitOrder({ orderId: "o", items, recipient: { ...recipient, city: "" } })).rejects.toThrow(IncompleteRecipientError);
    await expect(adapter.submitOrder({ orderId: "o", items: [{ skuId: "nope", quantity: 1 }], recipient })).rejects.toThrow("no target for nope");
    expect(calls).toEqual([]);
  });

  it.each([
    ["street", { street1: undefined }, "line1"],
    ["city", { city: " " }, "city"],
    ["postal code", { postalCode: undefined }, "postal_code"],
    ["country", { countryCode: "" }, "country_code"],
    ["name", { name: "" }, "name"],
    ["email", { email: "" }, "email"],
  ])("refuses an address without a %s before calling 3DAPI", async (_label, patch, field) => {
    const { adapter, calls } = setup(emptyThenCreate());
    const bad = { ...recipient, ...patch } as FulfillmentRecipient;
    const error = await adapter.submitOrder({ orderId: "order-1", items, recipient: bad }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IncompleteRecipientError);
    expect((error as IncompleteRecipientError).missing).toEqual([field]);
    expect(calls).toEqual([]);
  });

  it("refuses an order with no recipient at all, and uses resolveRecipient when the order has none", async () => {
    const none = setup(emptyThenCreate());
    await expect(none.adapter.submitOrder({ orderId: "order-1", items })).rejects.toThrow(IncompleteRecipientError);

    const resolved = setup(emptyThenCreate(), {
      resolveRecipient: async () => ({ shipping_address: { line1: "5 Rue X", city: "Paris", postal_code: "75001", country_code: "FR" }, customer: { name: "B", email: "b@example.com" } }),
    });
    await resolved.adapter.submitOrder({ orderId: "order-1", items });
    expect((resolved.posts()[0]!.body as { shipping_address: unknown }).shipping_address).toEqual({ line1: "5 Rue X", city: "Paris", postal_code: "75001", country_code: "FR" });
  });

  it("sends use_sample_credit only when asked", async () => {
    const { adapter, posts } = setup(emptyThenCreate(), { useSampleCredit: true });
    await adapter.submitOrder({ orderId: "order-1", items, recipient });
    expect((posts()[0]!.body as { use_sample_credit?: boolean }).use_sample_credit).toBe(true);
  });

  it("surfaces 3DAPI's error code when the order is refused, and creates no record", async () => {
    const { adapter } = setup((call) => (call.method === "GET" ? json(200, list([])) : json(402, apiError(402, "insufficient_balance", "The wallet is short and there is no saved card."))));
    const error = await adapter.submitOrder({ orderId: "order-1", items, recipient }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DapiApiError);
    expect(error).toMatchObject({ status: 402, code: "insufficient_balance", apiMessage: "The wallet is short and there is no saved card." });
  });

  it("uses stored mappings, and refuses an unmapped or malformed SKU before calling 3DAPI", async () => {
    const repo = createInMemoryProviderCatalogMappingRepository();
    await repo.save({ skuId: "sku-bracket", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A, materials: [{ slot: 2, material: MAT_WHITE }] } });
    await repo.save({ skuId: "both", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A, materials: [MAT_BLACK], useSuggestedMaterials: true } });
    await repo.save({ skuId: "neither", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A } });
    await repo.save({ skuId: "bad-quote", provider: DAPI_PROVIDER, target: { quoteId: 7, useSuggestedMaterials: true } });
    const { adapter, calls, posts } = setup(emptyThenCreate(), { resolveCatalogTarget: dapiCatalogTargetsFrom(repo) });

    await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-bracket", quantity: 3 }], recipient });
    expect((posts()[0]!.body as { items: unknown }).items).toEqual([{ quote: QUOTE_A, quantity: 3, materials: [{ slot: 2, material: MAT_WHITE }] }]);

    const before = calls.length;
    await expect(adapter.submitOrder({ orderId: "o2", items: [{ skuId: "none", quantity: 1 }], recipient })).rejects.toThrow(MissingCatalogMappingError);
    for (const skuId of ["both", "neither", "bad-quote"]) {
      await expect(adapter.submitOrder({ orderId: "o3", items: [{ skuId, quantity: 1 }], recipient })).rejects.toThrow(InvalidCatalogMappingError);
    }
    expect(calls.length).toBe(before);
  });

  it("hashes an order id that does not fit 3DAPI's reference pattern", () => {
    expect(dapiReferenceForOrder("3f1c9a2b-7d4e-4f60-8182-93a4b5c6d7e8")).toBe("3f1c9a2b-7d4e-4f60-8182-93a4b5c6d7e8");
    const hashed = dapiReferenceForOrder("order #1/2026");
    expect(hashed).toMatch(/^ml-[0-9a-f]{40}$/);
    expect(dapiReferenceForOrder("order #1/2026")).toBe(hashed);
  });
});

describe("status mapping", () => {
  const expected = {
    awaiting_payment: "held",
    paid: "submitted",
    assigned: "submitted",
    in_production: "submitted",
    shipped: "shipped",
    completed: "delivered",
    on_hold: "submitted",
    rejected: "submitted",
    returned: "shipped",
    cancelled: "unfulfilled",
  } as const;

  it("covers every status in the spec", () => {
    expect(Object.keys(expected).sort()).toEqual([...DAPI_ORDER_STATUSES].sort());
  });

  it.each(DAPI_ORDER_STATUSES.map((s) => [s, expected[s]] as const))("%s -> %s", async (status, mapped) => {
    expect(mapDapiOrderStatus(status)).toBe(mapped);
    const { adapter } = setup(() => json(200, list([order({ status })])));
    expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe(mapped);
  });
});

describe("getOrderStatus", () => {
  it("finds the order by reference and carries the tracking number through", async () => {
    const repo = createInMemoryProviderCatalogMappingRepository();
    await repo.save({ skuId: "sku-bracket", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A, materials: [MAT_BLACK] } });
    const shipped = order({ status: "shipped", shipping: { tier: "small", carrier: "DHL", tracking_number: "JD0146", shipped_at: "2026-11-12T09:00:00Z" } });
    const { adapter, calls } = setup(() => json(200, list([shipped])), { resolveSkuId: dapiSkuIdsFrom(repo) });

    expect(await adapter.getOrderStatus("order-1")).toEqual<FulfillmentLineRecord[]>([
      { orderId: "order-1", skuId: "sku-bracket", provider: "3dapi", externalOrderId: "ord_1", status: "shipped", trackingNumber: "JD0146", trackingUrl: null },
    ]);
    expect(calls[0]!.url.pathname).toBe("/v2/integrator/orders");
    expect(calls[0]!.url.searchParams.get("reference")).toBe("order-1");
    expect(calls[0]!.url.searchParams.getAll("expand[]")).toEqual(["items"]);
  });

  it("returns nothing for an order 3DAPI has never seen", async () => {
    const { adapter } = setup(() => json(200, list([])));
    expect(await adapter.getOrderStatus("unknown")).toEqual([]);
  });

  it("prefers the order that is not cancelled, and reports a placeholder SKU id without resolveSkuId", async () => {
    const { adapter } = setup(() => json(200, list([order({ id: "ord_cancelled", status: "cancelled" }), order({ id: "ord_live", status: "assigned" })])));
    expect(await adapter.getOrderStatus("order-1")).toMatchObject([{ externalOrderId: "ord_live", skuId: "3dapi-item-itm_1", status: "submitted" }]);
  });

  it("reads the order itself when the list comes back without lines", async () => {
    const { items: _lines, ...withoutLines } = order();
    const { adapter, calls } = setup((call) => (call.url.pathname === "/v2/integrator/orders" ? json(200, list([withoutLines])) : json(200, order())));
    expect(await adapter.getOrderStatus("order-1")).toHaveLength(1);
    expect(calls[1]!.url.pathname).toBe("/v2/integrator/orders/ord_1");
  });

  it("dapiSkuIdsFrom tells two SKUs on one quote apart by their materials", async () => {
    const repo = createInMemoryProviderCatalogMappingRepository();
    await repo.save({ skuId: "a-white", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A, materials: [MAT_WHITE] } });
    await repo.save({ skuId: "b-black", provider: DAPI_PROVIDER, target: { quoteId: QUOTE_A, materials: [{ slot: 1, material: MAT_BLACK }] } });
    const resolve = dapiSkuIdsFrom(repo);
    expect(await resolve({ orderId: "o", quoteId: QUOTE_A, materialIds: [MAT_BLACK], quantity: 1 })).toBe("b-black");
    expect(await resolve({ orderId: "o", quoteId: QUOTE_A, materialIds: ["mat_Other"], quantity: 1 })).toBe("a-white");
    expect(await resolve({ orderId: "o", quoteId: QUOTE_B, materialIds: [], quantity: 1 })).toBeNull();
  });
});

describe("contract", () => {
  it("satisfies FulfillmentAdapter and registers under 3dapi", () => {
    const adapter = assertDapiAdapterSatisfiesFulfillmentAdapter({ apiKey: "k", resolveCatalogTarget: async () => ({ quoteId: QUOTE_A, useSuggestedMaterials: true }) });
    expect(typeof adapter.submitOrder).toBe("function");
    expect(typeof adapter.handleWebhookEvent).toBe("function");
    expect(DAPI_PROVIDER).toBe("3dapi");
  });
});
