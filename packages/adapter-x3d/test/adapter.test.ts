import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryProviderCatalogMappingRepository,
  createInMemoryProviderOrderLinkRepository,
  createProviderOrderStatusRecorder,
  FULFILLMENT_ORDER_STATUS_CHANGED,
  InvalidCatalogMappingError,
  type FulfillmentOrderStatusChanged,
  type FulfillmentRecipient,
} from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  createInMemoryX3dOrderStore,
  createX3dFulfillmentAdapter,
  createX3dHttpClient,
  createX3dStatusPoller,
  isX3dMulticolourTarget,
  mapX3dOrderStatus,
  parseX3dCatalogTarget,
  X3D_ORDER_STATUSES,
  X3D_PROVIDER,
  X3dApiError,
  x3dCatalogTargetsFrom,
  X3dDestinationNotServedError,
  X3dIncompleteRecipientError,
  X3dOrderNotRememberedError,
  x3dOrderStoreFrom,
  X3dSubmitError,
  type X3dCatalogTarget,
  type X3dFulfillmentAdapterConfig,
} from "../src/index.js";
import { fakeX3d } from "./fake-x3d.js";

const RECIPIENT: FulfillmentRecipient = { name: "Ada Example", email: "ada@example.com", address: "1 Main St, Austin TX", street1: "1 Main St", city: "Austin", stateCode: "TX", postalCode: "78701", countryCode: "US" };

const TARGETS: Record<string, X3dCatalogTarget> = {
  "sku-dragon": { fileUrl: "https://cdn.store.example/models/dragon.gcode.3mf", material: "pla" },
  "sku-bracket": { fileUrl: "https://cdn.store.example/models/bracket.stl", material: "petg", color: "Black", infill: 40 },
  "sku-held": { modelUrl: "gs://x3d-models/acct/vase.3mf", color: "White" },
};

function setup(overrides: Partial<X3dFulfillmentAdapterConfig> = {}, fake = fakeX3d()) {
  const orderStore = createInMemoryX3dOrderStore();
  const adapter = createX3dFulfillmentAdapter({
    apiKey: "x3d_live_made_up",
    fetchImpl: fake.fetchImpl,
    orderStore,
    resolveCatalogTarget: async (skuId) => {
      const target = TARGETS[skuId];
      if (!target) throw new Error(`no mapping for ${skuId}`);
      return target;
    },
    ...overrides,
  });
  return { adapter, fake, orderStore };
}

const order = (items: { skuId: string; quantity: number }[], recipient: FulfillmentRecipient | undefined = RECIPIENT) => ({ orderId: "order-1", items, ...(recipient ? { recipient } : {}) });

describe("submitOrder", () => {
  it("places one X3D order per line, uploading the file with its settings and the address", async () => {
    const { adapter, fake } = setup();
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 3 }]));

    expect(records).toEqual([
      { orderId: "order-1", skuId: "sku-dragon", provider: X3D_PROVIDER, externalOrderId: "X3D-AAAAA1", status: "submitted", trackingNumber: null, trackingUrl: null },
      { orderId: "order-1", skuId: "sku-bracket", provider: X3D_PROVIDER, externalOrderId: "X3D-AAAAA2", status: "submitted", trackingNumber: null, trackingUrl: null },
    ]);
    const [dragon, bracket] = fake.orderPosts();
    expect(dragon!.headers.Authorization).toBe("Bearer x3d_live_made_up");
    expect(dragon!.form).toEqual({ file: { name: "dragon.gcode.3mf", size: 11 }, recipientName: "Ada Example", street1: "1 Main St", city: "Austin", state: "TX", zip: "78701", country: "US", quantity: "1", shippingSpeed: "standard", material: "pla" });
    expect(bracket!.form).toMatchObject({ file: { name: "bracket.stl", size: 11 }, quantity: "3", material: "petg", color: "Black", infill: "40" });
  });

  it("sends a model X3D already holds by its gs:// URI instead of uploading", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-held", quantity: 1 }]));
    expect(fake.orderPosts()[0]!.form).toMatchObject({ modelUrl: "gs://x3d-models/acct/vase.3mf", color: "White" });
    expect(fake.orderPosts()[0]!.form).not.toHaveProperty("file");
  });

  it("keeps the customer's email from X3D unless asked, and sends the listed addresses", async () => {
    const quiet = setup();
    await quiet.adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    expect(quiet.fake.orderPosts()[0]!.form).not.toHaveProperty("email");

    const loud = setup({ emailCustomer: true, notifyEmails: ["orders@store.example"] });
    await loud.adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    expect(loud.fake.orderPosts()[0]!.form!.email).toEqual(["ada@example.com", "orders@store.example"]);
  });

  it("sends express only inside the US", async () => {
    const { adapter, fake } = setup({ shippingSpeed: "express" });
    await adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    await adapter.submitOrder({ ...order([{ skuId: "sku-held", quantity: 1 }], { ...RECIPIENT, countryCode: "ca", stateCode: "ON" }), orderId: "order-2" });
    expect(fake.orderPosts().map((call) => [call.form!.country, call.form!.shippingSpeed])).toEqual([["US", "express"], ["CA", "standard"]]);
  });

  it("🔒 does not place a line twice when the order is submitted again", async () => {
    const { adapter, fake } = setup();
    const first = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    const again = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 1 }]));
    expect(fake.orderPosts()).toHaveLength(2);
    expect(again[0]).toEqual(first[0]);
    expect(again[1]!.externalOrderId).toBe("X3D-AAAAA2");
  });

  it("places a line again once X3D cancelled or rejected its order", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.set("X3D-AAAAA1", { status: "REJECTED" });
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    expect(records[0]!.externalOrderId).toBe("X3D-AAAAA2");
    expect((await adapter.getOrderStatus("order-1"))[0]).toMatchObject({ externalOrderId: "X3D-AAAAA2", status: "submitted" });
  });

  it("🔒 sends nothing when any line is unmapped or the address cannot be shipped to", async () => {
    const { adapter, fake } = setup();
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }, { skuId: "sku-unknown", quantity: 1 }]))).rejects.toThrow("no mapping");
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }], { ...RECIPIENT, city: " ", postalCode: undefined }))).rejects.toThrow(X3dIncompleteRecipientError);
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }], { ...RECIPIENT, countryCode: "BR" }))).rejects.toThrow(X3dDestinationNotServedError);
    await expect(adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-bracket", quantity: 1 }] })).rejects.toThrow("shipping address");
    expect(fake.calls).toHaveLength(0);
  });

  it("with holdOrders, sends nothing and reports the lines held; releasing places them", async () => {
    const fake = fakeX3d();
    const orderStore = createInMemoryX3dOrderStore();
    const held = setup({ holdOrders: true, orderStore }, fake);
    expect(await held.adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]))).toEqual([{ orderId: "order-1", skuId: "sku-bracket", provider: X3D_PROVIDER, externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null }]);
    expect(fake.orderPosts()).toHaveLength(0);
    const released = setup({ orderStore }, fake);
    expect((await released.adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }])))[0]!.status).toBe("submitted");
  });

  it("reports an order X3D could not charge as held, and does not place it again", async () => {
    const { adapter, fake } = setup();
    fake.declineCards();
    const records = await adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    expect(records[0]).toMatchObject({ externalOrderId: "X3D-AAAAA1", status: "held" });
    expect(adapter.placedOrderDetails("X3D-AAAAA1")).toMatchObject({ paid: false, chargeOutcome: "not-charged" });
    await adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    expect(fake.orderPosts()).toHaveLength(1);
  });

  it("when a later line fails, keeps the earlier one and places only the failed line on retry", async () => {
    const { adapter, fake } = setup();
    const lines = [{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 1 }];
    // The first POST succeeds; the second is refused.
    const original = fake.fetchImpl;
    let posts = 0;
    const flaky = setup({
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).endsWith("/api/print/orders") && ++posts === 2) fake.failNextOrder({ status: 422, error: "Model exceeds the build volume." });
        return original(input, init);
      }) as typeof fetch,
    }, fake);
    const failure = await flaky.adapter.submitOrder(order(lines)).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(X3dSubmitError);
    expect(failure).toMatchObject({ skuId: "sku-bracket", outcomeUnknown: false });
    expect((failure as X3dSubmitError).placed.map((record) => record.externalOrderId)).toEqual(["X3D-AAAAA1"]);
    expect((failure as X3dSubmitError).cause).toBeInstanceOf(X3dApiError);

    const retried = await flaky.adapter.submitOrder(order(lines));
    expect(retried.map((record) => record.externalOrderId)).toEqual(["X3D-AAAAA1", "X3D-AAAAA2"]);
    expect(fake.orderPosts()).toHaveLength(3);
    void adapter;
  });

  it("🔒 says the outcome is unknown when the order request got no answer", async () => {
    const { adapter, fake } = setup();
    fake.failNextOrder("network");
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]))).rejects.toMatchObject({ name: "X3dSubmitError", outcomeUnknown: true });
  });

  it("says nothing was sent when the model could not be fetched", async () => {
    const { adapter, fake } = setup({ resolveCatalogTarget: async () => ({ fileUrl: "https://cdn.store.example/missing/part.stl" }) });
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]))).rejects.toMatchObject({ name: "X3dSubmitError", outcomeUnknown: false });
    expect(fake.orderPosts()).toHaveLength(0);
  });

  it("🔒 names the X3D order when it was placed but could not be remembered", async () => {
    const { adapter } = setup({ orderStore: { list: async () => [], remember: async () => { throw new Error("db down"); } } });
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]))).rejects.toMatchObject({ name: "X3dOrderNotRememberedError", code: "X3D-AAAAA1" });
    expect(X3dOrderNotRememberedError).toBeDefined();
  });

  it("uses loadModel when the model sits behind authentication", async () => {
    const { adapter, fake } = setup({ loadModel: async () => new Blob(["private model bytes"]) });
    await adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }]));
    expect(fake.orderPosts()[0]!.form!.file).toEqual({ name: "bracket.stl", size: 19 });
    expect(fake.calls).toHaveLength(1);
  });
});

describe("getOrderStatus", () => {
  it("reads each line's order back with its tracking number", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 1 }]));
    fake.set("X3D-AAAAA1", { status: "SHIPPED", tracking: { number: "9400100000000000000000", carrier: "USPS" } });
    fake.set("X3D-AAAAA2", { status: "PRINTING" });
    expect((await adapter.getOrderStatus("order-1")).map((record) => [record.skuId, record.status, record.trackingNumber])).toEqual([
      ["sku-dragon", "shipped", "9400100000000000000000"],
      ["sku-bracket", "submitted", null],
    ]);
    expect(await adapter.getOrderStatus("order-unknown")).toEqual([]);
  });

  it("skips an order X3D no longer returns", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.forget("X3D-AAAAA1");
    expect(await adapter.getOrderStatus("order-1")).toEqual([]);
  });
});

describe("mapX3dOrderStatus", () => {
  it("maps every documented status, and an unknown one to submitted", () => {
    expect(X3D_ORDER_STATUSES.map((status) => [status, mapX3dOrderStatus(status)])).toEqual([
      ["PENDING_PAYMENT", "held"],
      ["RECEIVED", "submitted"],
      ["ACCEPTED", "submitted"],
      ["PRINTING", "submitted"],
      ["PRINTED", "submitted"],
      ["SHIPPED", "shipped"],
      ["DELIVERED", "delivered"],
      ["CANCELLED", "unfulfilled"],
      ["REJECTED", "unfulfilled"],
    ]);
    expect(mapX3dOrderStatus("ON_FIRE")).toBe("submitted");
  });
});

describe("catalog targets", () => {
  it("accepts a file URL or a held model, and refuses what X3D would mishandle", () => {
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/a/dragon.gcode.3mf", material: "pla", nozzleDiameter: 0.4 })).toMatchObject({ ok: true });
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/download?id=7", fileName: "dragon.3mf" })).toMatchObject({ ok: true });
    expect(parseX3dCatalogTarget({ modelUrl: "gs://bucket/model.stl" })).toMatchObject({ ok: true });
    expect(parseX3dCatalogTarget({})).toMatchObject({ ok: false });
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/a.stl", modelUrl: "gs://b/a.stl" })).toMatchObject({ ok: false });
    expect(parseX3dCatalogTarget({ modelUrl: "https://cdn.example/a.stl" })).toMatchObject({ ok: false });
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/download?id=7" })).toMatchObject({ ok: false });
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/a.obj" })).toMatchObject({ ok: false });
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/a.stl", material: "nylon" })).toMatchObject({ ok: false });
    // X3D would silently print this at 0.4 mm.
    expect(parseX3dCatalogTarget({ fileUrl: "https://cdn.example/a.stl", nozzleDiameter: 0.5 })).toMatchObject({ ok: false });
  });

  it("knows a sliced .gcode.3mf is the multicolour form", () => {
    expect(isX3dMulticolourTarget({ fileUrl: "https://cdn.example/dragon.gcode.3mf" })).toBe(true);
    expect(isX3dMulticolourTarget({ fileUrl: "https://cdn.example/dragon.3mf" })).toBe(false);
    expect(isX3dMulticolourTarget({ modelUrl: "gs://b/dragon.gcode.3mf" })).toBe(false);
  });

  it("reads targets from stored mappings and refuses a bad one by SKU", async () => {
    const repository = createInMemoryProviderCatalogMappingRepository();
    await repository.save({ skuId: "sku-ok", provider: X3D_PROVIDER, target: { fileUrl: "https://cdn.example/a.stl", color: "Red" } });
    await repository.save({ skuId: "sku-bad", provider: X3D_PROVIDER, target: { color: "Red" } });
    const resolve = x3dCatalogTargetsFrom(repository);
    expect(await resolve("sku-ok")).toEqual({ fileUrl: "https://cdn.example/a.stl", color: "Red" });
    await expect(resolve("sku-bad")).rejects.toThrow(InvalidCatalogMappingError);
  });
});

describe("with provider order links and the status poller", () => {
  function linked() {
    const fake = fakeX3d();
    const links = createInMemoryProviderOrderLinkRepository();
    const events = createInMemoryEventBus();
    const published: FulfillmentOrderStatusChanged[] = [];
    events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    const { adapter } = setup({ orderStore: x3dOrderStoreFrom(links) }, fake);
    const poller = createX3dStatusPoller({ getOrder: adapter.getX3dOrder, links, record: (update) => recorder.record(X3D_PROVIDER, update) });
    return { fake, links, adapter, poller, published };
  }

  it("a second adapter instance on the same links does not place the order again", async () => {
    const { fake, links, adapter } = linked();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    const restarted = setup({ orderStore: x3dOrderStoreFrom(links) }, fake).adapter;
    await restarted.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    expect(fake.orderPosts()).toHaveLength(1);
  });

  it("publishes each line's status change once, with its SKU, tracking number and carrier", async () => {
    const { fake, adapter, poller, published } = linked();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 1 }]));

    expect(await poller.poll()).toEqual({ checked: 2, published: 2, failed: [] });
    expect(await poller.poll()).toEqual({ checked: 2, published: 0, failed: [] });

    fake.set("X3D-AAAAA1", { status: "SHIPPED", tracking: { number: "TRK1", carrier: "USPS" } });
    expect((await poller.poll()).published).toBe(1);
    expect(published.at(-1)).toMatchObject({ orderId: "order-1", skuIds: ["sku-dragon"], externalOrderId: "X3D-AAAAA1", status: "shipped", trackingNumber: "TRK1", carrier: "USPS", previousStatus: "submitted" });
  });

  it("stops reading an order once it is delivered, and carries on past one it cannot read", async () => {
    const { fake, adapter, poller } = linked();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-bracket", quantity: 1 }]));
    fake.set("X3D-AAAAA1", { status: "DELIVERED" });
    await poller.poll();
    expect((await poller.poll()).checked).toBe(1);

    const broken = createX3dStatusPoller({
      getOrder: async (code) => {
        if (code === "X3D-AAAAA2") throw new Error("timeout");
        return adapter.getX3dOrder(code);
      },
      links: { listOpen: async () => [{ orderId: "o", provider: X3D_PROVIDER, externalOrderId: "X3D-AAAAA2", skuIds: [], status: null, trackingNumber: null, carrier: null }, { orderId: "o", provider: X3D_PROVIDER, externalOrderId: "X3D-AAAAA1", skuIds: [], status: null, trackingNumber: null, carrier: null }] },
      record: async () => "unchanged",
    });
    expect(await broken.poll()).toMatchObject({ checked: 1, failed: [{ code: "X3D-AAAAA2" }] });
  });
});

describe("createX3dHttpClient", () => {
  it("prices one colour without a key, and surfaces X3D's error message", async () => {
    const fake = fakeX3d();
    const client = createX3dHttpClient({ apiKey: "x3d_live_made_up", fetchImpl: fake.fetchImpl });
    expect(await client.price({ bboxMm: { x: 40, y: 40, z: 40 }, material: "pla" })).toMatchObject({ subtotal: 5, total: 12 });
    expect(fake.calls[0]!.headers).not.toHaveProperty("Authorization");
    expect(await client.getOrder("X3D-NOPE")).toBeNull();
    fake.failNextOrder({ status: 400, error: "Unknown material." });
    await expect(client.createOrder({ quantity: 1, recipientName: "A", street1: "1", city: "C", state: "TX", zip: "1", country: "US" }, { modelUrl: "gs://b/a.stl" })).rejects.toMatchObject({ status: 400, x3dMessage: "Unknown material." });
  });
});
