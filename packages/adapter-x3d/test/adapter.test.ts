import { createInMemoryEventBus, UnresolvedRegionError } from "@mercatus-liber/core";
import { mapRecipientToX3d } from "../src/mapping.js";
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
  estimateX3dSlicedOrderCost,
  x3dColourSurchargeCentsPerGram,
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

describe("personalised prints: a file per order line", () => {
  // Two art boxes in one order, same SKU, each with a different name on it.
  const lines = [
    { skuId: "sku-art-box", quantity: 1, lineId: "line-1" },
    { skuId: "sku-art-box", quantity: 2, lineId: "line-2" },
  ];
  const sliced: Record<string, string> = { "line-1": "https://cdn.store.example/jobs/order-1/line-1.gcode.3mf", "line-2": "https://cdn.store.example/jobs/order-1/line-2.gcode.3mf" };

  function personalised(ready: Record<string, string> = sliced, fake = fakeX3d()) {
    const links = createInMemoryProviderOrderLinkRepository();
    const seen: unknown[] = [];
    const { adapter } = setup(
      {
        orderStore: x3dOrderStoreFrom(links),
        resolveCatalogTarget: async (skuId, line) => {
          seen.push({ skuId, ...line });
          const fileUrl = line.lineId ? ready[line.lineId] : undefined;
          if (!fileUrl) throw new Error(`no sliced file for line ${line.lineId} yet`);
          return { fileUrl };
        },
      },
      fake,
    );
    return { adapter, fake, links, seen };
  }

  it("asks for each line's own file and places them as separate orders", async () => {
    const { adapter, fake, seen } = personalised();
    const records = await adapter.submitOrder(order(lines));
    expect(seen).toEqual([
      { skuId: "sku-art-box", orderId: "order-1", lineId: "line-1", lineIndex: 0, quantity: 1 },
      { skuId: "sku-art-box", orderId: "order-1", lineId: "line-2", lineIndex: 1, quantity: 2 },
    ]);
    expect(fake.orderPosts().map((call) => [(call.form!.file as { name: string }).name, call.form!.quantity])).toEqual([["line-1.gcode.3mf", "1"], ["line-2.gcode.3mf", "2"]]);
    expect(records.map((record) => [record.lineId, record.skuId, record.externalOrderId])).toEqual([["line-1", "sku-art-box", "X3D-AAAAA1"], ["line-2", "sku-art-box", "X3D-AAAAA2"]]);
  });

  it("🔒 sends nothing when one line has no sliced file yet", async () => {
    const { adapter, fake } = personalised({ "line-1": sliced["line-1"]! });
    await expect(adapter.submitOrder(order(lines))).rejects.toThrow("no sliced file for line line-2 yet");
    expect(fake.calls).toHaveLength(0);
  });

  it("🔒 on a retry, places only the line that is missing, not the other line of the same SKU", async () => {
    const { adapter, fake } = personalised();
    await adapter.submitOrder(order([lines[0]!]));
    const records = await adapter.submitOrder(order(lines));
    expect(fake.orderPosts()).toHaveLength(2);
    expect(records.map((record) => record.externalOrderId)).toEqual(["X3D-AAAAA1", "X3D-AAAAA2"]);
    // A third submit places nothing.
    await adapter.submitOrder(order(lines));
    expect(fake.orderPosts()).toHaveLength(2);
  });

  it("reports each line's status separately and names the line on the status event", async () => {
    const { adapter, fake, links } = personalised();
    await adapter.submitOrder(order(lines));
    fake.set("X3D-AAAAA2", { status: "SHIPPED", tracking: { number: "TRK2", carrier: "USPS" } });
    expect((await adapter.getOrderStatus("order-1")).map((record) => [record.lineId, record.status])).toEqual([["line-1", "submitted"], ["line-2", "shipped"]]);

    const events = createInMemoryEventBus();
    const published: FulfillmentOrderStatusChanged[] = [];
    events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    await createX3dStatusPoller({ getOrder: adapter.getX3dOrder, links, record: (update) => recorder.record(X3D_PROVIDER, update) }).poll();
    expect(published.find((event) => event.status === "shipped")).toMatchObject({ orderId: "order-1", skuIds: ["sku-art-box"], lineIds: ["line-2"], trackingNumber: "TRK2" });
  });

  it("passes the line to loadModel too", async () => {
    const got: unknown[] = [];
    const fake = fakeX3d();
    const { adapter } = setup({ resolveCatalogTarget: async () => ({ fileUrl: "https://private.example/a.gcode.3mf" }), loadModel: async (_target, _skuId, line) => { got.push(line); return new Blob(["bytes"]); } }, fake);
    await adapter.submitOrder(order([lines[1]!]));
    expect(got).toEqual([{ orderId: "order-1", lineId: "line-2", lineIndex: 0, quantity: 2 }]);
  });
});

describe("a product printed as several parts", () => {
  // An art box is a base and a lid: two plates, so two X3D orders for one order line.
  const line = { skuId: "sku-art-box", quantity: 1, lineId: "line-1" };
  const box = [
    { partId: "base", fileUrl: "https://cdn.store.example/jobs/line-1/base.gcode.3mf" },
    { partId: "lid", fileUrl: "https://cdn.store.example/jobs/line-1/lid.gcode.3mf" },
  ];

  function multi(fake = fakeX3d(), overrides: Partial<X3dFulfillmentAdapterConfig> = {}) {
    const links = createInMemoryProviderOrderLinkRepository();
    const events = createInMemoryEventBus();
    const published: FulfillmentOrderStatusChanged[] = [];
    events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    const { adapter } = setup({ orderStore: x3dOrderStoreFrom(links), resolveCatalogTarget: async () => box, ...overrides }, fake);
    const poller = createX3dStatusPoller({ getOrder: adapter.getX3dOrder, links, record: (update) => recorder.record(X3D_PROVIDER, update) });
    return { adapter, fake, links, published, poller };
  }

  it("places one X3D order per part and reports them as one submitted line", async () => {
    const { adapter, fake } = multi();
    const records = await adapter.submitOrder(order([line]));
    expect(fake.orderPosts().map((call) => (call.form!.file as { name: string }).name)).toEqual(["base.gcode.3mf", "lid.gcode.3mf"]);
    expect(records).toEqual([{ orderId: "order-1", skuId: "sku-art-box", lineId: "line-1", provider: X3D_PROVIDER, externalOrderId: "X3D-AAAAA1,X3D-AAAAA2", status: "submitted", trackingNumber: null, trackingUrl: null }]);
  });

  it("🔒 resolves every part before sending anything", async () => {
    const { adapter, fake } = multi(fakeX3d(), { resolveCatalogTarget: async (skuId) => (skuId === "sku-art-box" ? box : Promise.reject(new Error("no sliced file yet"))) });
    await expect(adapter.submitOrder(order([line, { skuId: "sku-caddy", quantity: 1, lineId: "line-2" }]))).rejects.toThrow("no sliced file yet");
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses parts with no id, a repeated id, or none at all", async () => {
    for (const bad of [[], [{ partId: "", fileUrl: "https://c.example/a.stl" }], [box[0]!, box[0]!]]) {
      const { adapter, fake } = multi(fakeX3d(), { resolveCatalogTarget: async () => bad });
      await expect(adapter.submitOrder(order([line]))).rejects.toThrow();
      expect(fake.calls).toHaveLength(0);
    }
  });

  it("🔒 when the second part fails, a retry places only that part, and the line reads unfulfilled until then", async () => {
    const fake = fakeX3d();
    const original = fake.fetchImpl;
    let posts = 0;
    const { adapter } = multi(fake, {
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).endsWith("/api/print/orders") && ++posts === 2) fake.failNextOrder({ status: 422, error: "Model exceeds the build volume." });
        return original(input, init);
      }) as typeof fetch,
    });
    const failure = (await adapter.submitOrder(order([line])).catch((err: unknown) => err)) as X3dSubmitError;
    expect(failure).toBeInstanceOf(X3dSubmitError);
    expect(failure.placed.map((record) => record.externalOrderId)).toEqual(["X3D-AAAAA1"]);
    // Half placed: reads unfulfilled, so the fulfillment service submits the line again.
    expect((await adapter.getOrderStatus("order-1")).map((record) => record.status)).toEqual(["unfulfilled"]);

    const retried = await adapter.submitOrder(order([line]));
    expect(retried[0]).toMatchObject({ externalOrderId: "X3D-AAAAA1,X3D-AAAAA2", status: "submitted" });
    expect(fake.orderPosts().map((call) => (call.form!.file as { name: string }).name)).toEqual(["base.gcode.3mf", "lid.gcode.3mf", "lid.gcode.3mf"]);
    expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe("submitted");
  });

  it("places a cancelled part again without touching the other", async () => {
    const { adapter, fake } = multi();
    await adapter.submitOrder(order([line]));
    fake.set("X3D-AAAAA2", { status: "CANCELLED" });
    expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe("unfulfilled");
    const records = await adapter.submitOrder(order([line]));
    expect(records[0]).toMatchObject({ externalOrderId: "X3D-AAAAA1,X3D-AAAAA3", status: "submitted" });
    expect(fake.orderPosts()).toHaveLength(3);
  });

  it("reads held when a part's card was declined", async () => {
    const { adapter, fake } = multi();
    await adapter.submitOrder(order([line]));
    fake.set("X3D-AAAAA2", { status: "PENDING_PAYMENT" });
    expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe("held");
  });

  it("with holdOrders, sends no part and reports the line held", async () => {
    const { adapter, fake } = multi(fakeX3d(), { holdOrders: true });
    expect((await adapter.submitOrder(order([line])))[0]).toMatchObject({ status: "held", externalOrderId: null });
    expect(fake.orderPosts()).toHaveLength(0);
  });

  it("is shipped only when every part has shipped, with every tracking number", async () => {
    const { adapter, fake } = multi();
    await adapter.submitOrder(order([line]));
    fake.set("X3D-AAAAA1", { status: "SHIPPED", tracking: { number: "TRK-BASE", carrier: "USPS" } });
    expect((await adapter.getOrderStatus("order-1"))[0]).toMatchObject({ status: "submitted", trackingNumber: null });
    fake.set("X3D-AAAAA2", { status: "SHIPPED", tracking: { number: "TRK-LID", carrier: "USPS" } });
    expect((await adapter.getOrderStatus("order-1"))[0]).toMatchObject({ status: "shipped", trackingNumber: "TRK-BASE, TRK-LID" });
  });

  it("🔒 publishes the line's shipped change once, when the last part ships", async () => {
    const { adapter, fake, published, poller } = multi();
    await adapter.submitOrder(order([line]));
    await poller.poll();
    expect(published.map((event) => event.status)).toEqual(["submitted"]);

    fake.set("X3D-AAAAA1", { status: "SHIPPED", tracking: { number: "TRK-BASE", carrier: "USPS" } });
    await poller.poll();
    await poller.poll();
    // One part in the post is not news for the buyer yet.
    expect(published.map((event) => event.status)).toEqual(["submitted"]);

    fake.set("X3D-AAAAA2", { status: "SHIPPED", tracking: { number: "TRK-LID", carrier: "USPS" } });
    await poller.poll();
    await poller.poll();
    expect(published.map((event) => event.status)).toEqual(["submitted", "shipped"]);
    expect(published[1]).toMatchObject({ orderId: "order-1", skuIds: ["sku-art-box"], lineIds: ["line-1"], trackingNumber: "TRK-BASE, TRK-LID", carrier: "USPS", previousStatus: "submitted" });

    // Delivered the same way: once, after the last part, even though the first was delivered a poll earlier.
    fake.set("X3D-AAAAA1", { status: "DELIVERED" });
    await poller.poll();
    fake.set("X3D-AAAAA2", { status: "DELIVERED" });
    await poller.poll();
    await poller.poll();
    expect(published.map((event) => event.status)).toEqual(["submitted", "shipped", "delivered"]);
  });

  it("publishes nothing for a line with a part not yet placed", async () => {
    const fake = fakeX3d();
    const original = fake.fetchImpl;
    let posts = 0;
    const { adapter, published, poller } = multi(fake, {
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST" && String(input).endsWith("/api/print/orders") && ++posts === 2) fake.failNextOrder({ status: 422, error: "nope" });
        return original(input, init);
      }) as typeof fetch,
    });
    await adapter.submitOrder(order([line])).catch(() => undefined);
    // The base is placed and even ships; the lid was never placed.
    fake.set("X3D-AAAAA1", { status: "SHIPPED", tracking: { number: "TRK-BASE", carrier: "USPS" } });
    expect(await poller.poll()).toMatchObject({ checked: 1, published: 0, failed: [] });
    expect(published).toHaveLength(0);
  });

  it("does not place the parts again from a second adapter instance on the same links", async () => {
    const fake = fakeX3d();
    const first = multi(fake);
    await first.adapter.submitOrder(order([line]));
    const { adapter } = setup({ orderStore: x3dOrderStoreFrom(first.links), resolveCatalogTarget: async () => box }, fake);
    await adapter.submitOrder(order([line]));
    expect(fake.orderPosts()).toHaveLength(2);
  });
});

describe("estimateX3dSlicedOrderCost", () => {
  it("prices an art box base and lid as two orders, each with its own postage", () => {
    // Weights from a real slice of the product: base 260 g, lid 166 g.
    const base = estimateX3dSlicedOrderCost({ grams: 260, filaments: 4 });
    const lid = estimateX3dSlicedOrderCost({ grams: 166, filaments: 4 });
    // Four colours is $0.19/g for PLA. The base clears the free-postage line; the lid does not.
    expect(base).toEqual({ print: 50, secondAmsFee: 0, shipping: 0, total: 50 });
    expect(lid).toEqual({ print: 32, secondAmsFee: 0, shipping: 7, total: 39 });
  });

  it("raises the rate per gram by $0.03 at two colours and $0.02 for each colour after", () => {
    expect([1, 2, 3, 4, 5, 8].map(x3dColourSurchargeCentsPerGram)).toEqual([0, 3, 5, 7, 9, 15]);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1 }).print).toBe(12);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 2 }).print).toBe(15);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 3 }).print).toBe(17);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 2, material: "asa" }).print).toBe(18);
  });

  it("adds the second-AMS fee at five filaments and drops postage at a $49.50 print", () => {
    expect(estimateX3dSlicedOrderCost({ grams: 120, filaments: 5 })).toEqual({ print: 26, secondAmsFee: 25, shipping: 7, total: 58 });
    expect(estimateX3dSlicedOrderCost({ grams: 420, filaments: 2 })).toEqual({ print: 63, secondAmsFee: 0, shipping: 0, total: 63 });
    // The fee is assumed not to count toward free postage.
    expect(estimateX3dSlicedOrderCost({ grams: 150, filaments: 6 })).toEqual({ print: 35, secondAmsFee: 25, shipping: 7, total: 67 });
  });

  it("applies the bulk discount, the $1 minimum, other materials and other destinations", () => {
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1, quantity: 5 }).print).toBe(57);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1, quantity: 10 }).print).toBe(108);
    expect(estimateX3dSlicedOrderCost({ grams: 2, filaments: 1, quantity: 3 }).print).toBe(3);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1, material: "tpu" }).print).toBe(20);
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1, country: "ca" })).toMatchObject({ shipping: 30, total: 42 });
    expect(estimateX3dSlicedOrderCost({ grams: 100, filaments: 1, shippingSpeed: "express" }).shipping).toBe(15);
  });
});

describe("X3D state codes", () => {
  it("sends a US state typed as its name as its code", () => {
    expect(mapRecipientToX3d({ ...RECIPIENT, stateCode: "Texas" }).state).toBe("TX");
    expect(mapRecipientToX3d({ ...RECIPIENT, stateCode: undefined, stateName: "Texas" }).state).toBe("TX");
    expect(mapRecipientToX3d({ ...RECIPIENT, countryCode: "CA", stateCode: "Ontario" }).state).toBe("ON");
    expect(mapRecipientToX3d({ ...RECIPIENT, countryCode: "GB", stateCode: "Kent" }).state).toBe("Kent");
  });

  it("🔒 sends nothing for a US state it can't match", async () => {
    const { adapter, fake } = setup();
    await expect(adapter.submitOrder(order([{ skuId: "sku-bracket", quantity: 1 }], { ...RECIPIENT, stateCode: "Texass" }))).rejects.toThrow(UnresolvedRegionError);
    expect(fake.calls).toHaveLength(0);
  });
});
