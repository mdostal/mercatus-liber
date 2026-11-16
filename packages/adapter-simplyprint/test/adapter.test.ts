import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createInMemoryProviderCatalogMappingRepository,
  createInMemoryProviderOrderLinkRepository,
  createProviderOrderStatusRecorder,
  FULFILLMENT_ORDER_STATUS_CHANGED,
  InvalidCatalogMappingError,
  MissingCatalogMappingError,
  type FulfillmentOrderStatusChanged,
} from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  createInMemorySimplyPrintOrderStore,
  createSimplyPrintFulfillmentAdapter,
  createSimplyPrintHttpClient,
  mapSimplyPrintPrintState,
  parseSimplyPrintCatalogTarget,
  parseSimplyPrintWebhookEvent,
  queueItemIdFromAddItemResponse,
  SIMPLYPRINT_PRINT_STATES,
  SIMPLYPRINT_PRINTED_MARKER,
  SIMPLYPRINT_PROVIDER,
  SimplyPrintApiError,
  simplyPrintCatalogTargetsFrom,
  simplyPrintOrderStoreFrom,
  simplyPrintPrintLogFrom,
  simplyPrintPrintStateOf,
  SimplyPrintQueueItemNotRememberedError,
  simplyPrintQueueNote,
  simplyPrintStatusUpdateFromWebhookAction,
  SimplyPrintSubmitError,
  SimplyPrintUnreadableResponseError,
  simplyPrintWebhookActionFrom,
  SimplyPrintWebhookPayloadParseError,
  SimplyPrintWebhookSecretInvalidError,
  simplyPrintWebhookSecretMatches,
  SimplyPrintWebhookSecretNotConfiguredError,
  type SimplyPrintCatalogTarget,
  type SimplyPrintFulfillmentAdapterConfig,
  type SimplyPrintPrintNotice,
  type SimplyPrintWebhookAction,
} from "../src/index.js";
import { FAKE_API_KEY, FAKE_COMPANY_ID, fakeSimplyPrint } from "./fake-simplyprint.js";

const TARGETS: Record<string, SimplyPrintCatalogTarget> = {
  "sku-dragon": { fileId: "1a077dd6296417fe75555bf806b68089" },
  "sku-vase": { fileId: "d82ab9e1cc3c20850d94d5cf539390c0", queueGroupId: 213, customTagIds: [993, 994] },
};

function setup(overrides: Partial<SimplyPrintFulfillmentAdapterConfig> = {}, fake = fakeSimplyPrint()) {
  const orderStore = overrides.orderStore ?? createInMemorySimplyPrintOrderStore();
  const adapter = createSimplyPrintFulfillmentAdapter({
    apiKey: FAKE_API_KEY,
    companyId: FAKE_COMPANY_ID,
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

const order = (items: { skuId: string; quantity: number }[]) => ({ orderId: "order-1", items });

/** The real link repository and status recorder, with the adapter and its poller on top. */
function wired(overrides: Partial<SimplyPrintFulfillmentAdapterConfig> = {}) {
  const links = createInMemoryProviderOrderLinkRepository();
  const events = createInMemoryEventBus();
  const published: FulfillmentOrderStatusChanged[] = [];
  events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => void published.push(payload));
  const recorder = createProviderOrderStatusRecorder({ links, events });
  const record = (update: Parameters<typeof recorder.record>[1]) => recorder.record(SIMPLYPRINT_PROVIDER, update);
  const finished: SimplyPrintPrintNotice[] = [];
  const { adapter, fake } = setup({ orderStore: simplyPrintOrderStoreFrom(links), printLog: simplyPrintPrintLogFrom(links), ...overrides });
  const poller = adapter.createStatusPoller({ links, record, onPrintFinished: (notice) => void finished.push(notice) });
  return { adapter, fake, links, published, finished, poller, record };
}

describe("submitOrder", () => {
  it("adds one queue item per line with the documented fields, then notes the order on it", async () => {
    const { adapter, fake } = setup();
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 3 }, { skuId: "sku-vase", quantity: 1 }]));

    expect(records).toEqual([
      { orderId: "order-1", skuId: "sku-dragon", provider: "simplyprint", externalOrderId: "430001", status: "submitted", trackingNumber: null, trackingUrl: null },
      { orderId: "order-1", skuId: "sku-vase", provider: "simplyprint", externalOrderId: "430002", status: "submitted", trackingNumber: null, trackingUrl: null },
    ]);
    const [first, second] = fake.adds();
    expect(first!.method).toBe("POST");
    expect(first!.headers["X-API-KEY"]).toBe(FAKE_API_KEY);
    expect(first!.headers["Content-Type"]).toBe("application/json");
    // Quantity is the item's amount: one item, three prints.
    expect(first!.json).toEqual({ filesystem: "1a077dd6296417fe75555bf806b68089", amount: 3 });
    expect(second!.json).toEqual({ filesystem: "d82ab9e1cc3c20850d94d5cf539390c0", amount: 1, group: 213, tags: { tag_id: 993, custom: [993, 994] } });

    expect(fake.notes().map((call) => [call.query.job, call.json])).toEqual([
      ["430001", { note: "Order order-1 | SKU sku-dragon | qty 3" }],
      ["430002", { note: "Order order-1 | SKU sku-vase | qty 1" }],
    ]);
    expect(fake.item(430001)!.note).toBe("Order order-1 | SKU sku-dragon | qty 3");
    // A first submit has nothing to look up, so it reads nothing.
    expect(fake.lists()).toHaveLength(0);
  });

  it("sends the order id and SKU as custom fields and uses the default queue group when configured", async () => {
    const { adapter, fake } = setup({ orderIdCustomFieldId: "order_id", skuCustomFieldId: "sku", queueGroupId: 7 });
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    expect(fake.adds()[0]!.json).toEqual({
      filesystem: "1a077dd6296417fe75555bf806b68089",
      amount: 1,
      group: 7,
      custom_fields: [
        { customFieldId: "order_id", value: { string: "order-1" } },
        { customFieldId: "sku", value: { string: "sku-dragon" } },
      ],
    });
    // The SKU's own group wins over the default.
    expect((fake.adds()[1]!.json as { group: number }).group).toBe(213);
  });

  it("does not queue a line twice when the order is submitted again", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.set(430001, { ongoing: 1 });
    const again = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 2 }]));
    expect(fake.adds()).toHaveLength(2);
    expect(again.map((record) => [record.skuId, record.externalOrderId, record.status])).toEqual([
      ["sku-dragon", "430001", "submitted"],
      ["sku-vase", "430002", "submitted"],
    ]);
  });

  it("does not queue again a line whose print failed, is finished, or is no longer listed", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.set(430001, { failed: 1 });
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.finish(430001);
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.vanish(430001);
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    expect(fake.adds()).toHaveLength(1);
    expect(records[0]).toMatchObject({ externalOrderId: "430001", status: "submitted" });
  });

  it("queues a line again after its item was cancelled or denied", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    await adapter.cancelQueueItem("430001");
    expect(fake.deletes().map((call) => [call.method, call.query.job])).toEqual([["GET", "430001"]]);
    fake.set(430002, { approval: { status: "denied" } });
    expect((await adapter.getOrderStatus("order-1")).map((record) => [record.skuId, record.status])).toEqual([
      ["sku-dragon", "unfulfilled"],
      ["sku-vase", "unfulfilled"],
    ]);

    const again = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    expect(again.map((record) => record.externalOrderId)).toEqual(["430003", "430004"]);
    expect(fake.adds()).toHaveLength(4);
    // The newest item for each line is the one reported.
    expect((await adapter.getOrderStatus("order-1")).map((record) => [record.externalOrderId, record.status])).toEqual([
      ["430003", "submitted"],
      ["430004", "submitted"],
    ]);
  });

  it("queues a missing item again only when missingMeansCancelled is set", async () => {
    const { adapter, fake } = setup({ missingMeansCancelled: true });
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.vanish(430001);
    expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe("unfulfilled");
    const again = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    expect(again[0]!.externalOrderId).toBe("430002");
  });

  it("sends nothing and reports held lines with holdOrders", async () => {
    const { adapter, fake } = setup({ holdOrders: true });
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 2 }]));
    expect(records).toEqual([{ orderId: "order-1", skuId: "sku-dragon", provider: "simplyprint", externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null }]);
    expect(fake.calls).toHaveLength(0);
    expect(await adapter.getOrderStatus("order-1")).toEqual([]);
  });

  it("sends nothing when any line has no mapping", async () => {
    const { adapter, fake } = setup();
    await expect(adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-unmapped", quantity: 1 }]))).rejects.toThrow("no mapping for sku-unmapped");
    expect(fake.calls).toHaveLength(0);
  });

  it("reports a request with no answer as outcome unknown, and keeps what was queued before it", async () => {
    const { adapter, fake } = setup();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.failNextAdd("network");
    const error = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }])).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SimplyPrintSubmitError);
    const submitError = error as SimplyPrintSubmitError;
    expect(submitError.outcomeUnknown).toBe(true);
    expect(submitError.skuId).toBe("sku-vase");
    expect(submitError.queued.map((record) => record.externalOrderId)).toEqual(["430001"]);
    expect(submitError.message).toContain("check the print queue");
  });

  it("treats a 5xx and a success without an id as outcome unknown, and nothing is remembered for them", async () => {
    for (const how of [{ httpStatus: 502, message: "Bad gateway" }, "no-id"] as const) {
      const { adapter, fake, orderStore } = setup();
      fake.failNextAdd(how);
      const error = (await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }])).catch((err: unknown) => err)) as SimplyPrintSubmitError;
      expect(error).toBeInstanceOf(SimplyPrintSubmitError);
      expect(error.outcomeUnknown).toBe(true);
      expect(await orderStore.list("order-1")).toEqual([]);
    }
  });

  it("reports an error SimplyPrint gave as a plain failure, and a retry then queues the line", async () => {
    for (const how of [{ httpStatus: 403, message: "This endpoint requires the Print Farm plan" }, "status-false"] as const) {
      const { adapter, fake } = setup();
      fake.failNextAdd(how);
      const error = (await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }])).catch((err: unknown) => err)) as SimplyPrintSubmitError;
      expect(error).toBeInstanceOf(SimplyPrintSubmitError);
      expect(error.outcomeUnknown).toBe(false);
      expect(error.cause).toBeInstanceOf(SimplyPrintApiError);
      const retried = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
      expect(retried[0]!.status).toBe("submitted");
      expect(fake.adds()).toHaveLength(2);
    }
  });

  it("names the queue item when it was added but could not be remembered", async () => {
    const orderStore = { ...createInMemorySimplyPrintOrderStore(), remember: async () => Promise.reject(new Error("database down")) };
    const { adapter } = setup({ orderStore });
    const error = (await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }])).catch((err: unknown) => err)) as SimplyPrintQueueItemNotRememberedError;
    expect(error).toBeInstanceOf(SimplyPrintQueueItemNotRememberedError);
    expect(error.queueItemId).toBe("430001");
  });

  it("still reports the line queued when only the note failed", async () => {
    const noteErrors: { queueItemId: string }[] = [];
    const { adapter, fake } = setup({ onNoteError: (_error, item) => void noteErrors.push(item) });
    fake.failNextNote();
    const records = await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    expect(records[0]).toMatchObject({ externalOrderId: "430001", status: "submitted" });
    expect(noteErrors).toEqual([{ orderId: "order-1", skuId: "sku-dragon", queueItemId: "430001" }]);
    expect(fake.item(430001)!.note).toBeNull();
  });
});

describe("print states", () => {
  const listed = (item: Record<string, unknown>, slice: "active" | "pending" | "done" = "active") => ({ slice, item: { id: 1, ...item } });

  it("derives each state from SimplyPrint's documented queue item fields", () => {
    expect(simplyPrintPrintStateOf(listed({ is_done: false, paused: false, ongoing: 0, failed: 0, left: 2, printed: 0 }))).toBe("queued");
    expect(simplyPrintPrintStateOf(listed({ ongoing: 1, failed: 1 }))).toBe("printing");
    expect(simplyPrintPrintStateOf(listed({ ongoing: 0, failed: 2 }))).toBe("failed");
    expect(simplyPrintPrintStateOf(listed({ paused: true }))).toBe("paused");
    expect(simplyPrintPrintStateOf(listed({ is_done: true }))).toBe("printed");
    expect(simplyPrintPrintStateOf(listed({}, "done"))).toBe("printed");
    expect(simplyPrintPrintStateOf(listed({ approval: { status: "pending" } }))).toBe("pending_approval");
    expect(simplyPrintPrintStateOf(listed({ approval: { status: "revision" } }))).toBe("pending_approval");
    expect(simplyPrintPrintStateOf(listed({}, "pending"))).toBe("pending_approval");
    expect(simplyPrintPrintStateOf(listed({ approval: { status: "denied" }, ongoing: 1 }))).toBe("denied");
    expect(simplyPrintPrintStateOf(listed({ approval: { status: "approved" } }))).toBe("queued");
    expect(simplyPrintPrintStateOf(listed({}))).toBe("queued");
  });

  it("maps every state to a line status, and never to shipped or delivered", () => {
    const mapped = Object.fromEntries(SIMPLYPRINT_PRINT_STATES.map((state) => [state, mapSimplyPrintPrintState(state)]));
    expect(mapped).toEqual({
      pending_approval: "submitted",
      queued: "submitted",
      paused: "submitted",
      printing: "submitted",
      failed: "submitted",
      printed: "submitted",
      denied: "unfulfilled",
      cancelled: "unfulfilled",
      missing: "submitted",
    });
    expect(mapSimplyPrintPrintState("missing", { missingMeansCancelled: true })).toBe("unfulfilled");
  });

  it("reads an order's items with their states, without asking SimplyPrint about closed or printed ones", async () => {
    const { adapter, fake, poller } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    fake.set(430002, { ongoing: 1 });
    expect(await adapter.getPrintStates("order-1")).toEqual([
      { queueItemId: "430001", skuIds: ["sku-dragon"], printState: "queued" },
      { queueItemId: "430002", skuIds: ["sku-vase"], printState: "printing" },
    ]);

    fake.finish(430002);
    await adapter.cancelQueueItem("430001");
    await poller.poll();
    const listsBefore = fake.lists().length;
    expect((await adapter.getPrintStates("order-1")).map((entry) => entry.printState)).toEqual(["cancelled", "printed"]);
    expect(fake.lists()).toHaveLength(listsBefore);
  });
});

describe("the status poller", () => {
  it("publishes the line status once and reports a finished print once", async () => {
    const { adapter, fake, published, finished, poller, links } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 2 }]));

    expect(await poller.poll()).toEqual({ checked: 1, published: 1, finished: [], attention: [], failed: [] });
    expect(published).toEqual([
      { changeId: '["simplyprint","430001","submitted",null,null]', orderId: "order-1", skuIds: ["sku-dragon"], lineIds: [], provider: "simplyprint", externalOrderId: "430001", status: "submitted", trackingNumber: null, carrier: null, trackingUrl: null, previousStatus: null },
    ]);

    fake.set(430001, { ongoing: 1 });
    expect(await poller.poll()).toMatchObject({ checked: 1, published: 0, finished: [] });

    fake.finish(430001);
    const notice = { noticeId: '["simplyprint","430001","printed"]', orderId: "order-1", skuIds: ["sku-dragon"], queueItemId: "430001", printState: "printed" };
    expect(await poller.poll()).toEqual({ checked: 1, published: 0, finished: [notice], attention: [], failed: [] });
    expect(finished).toEqual([notice]);
    // Printed is not shipped: the line is still "submitted" and no second status event went out.
    expect(published).toHaveLength(1);
    expect((await links.findByExternalOrderId(SIMPLYPRINT_PROVIDER, "430001"))!.status).toBe("submitted");
    expect(await links.findByExternalOrderId(SIMPLYPRINT_PRINTED_MARKER, "430001")).toMatchObject({ orderId: "order-1", skuIds: ["sku-dragon"] });

    // A printed item is not read again, even after SimplyPrint drops it from the done list.
    fake.vanish(430001);
    const lists = fake.lists().length;
    expect(await poller.poll()).toEqual({ checked: 0, published: 0, finished: [], attention: [], failed: [] });
    expect(fake.lists()).toHaveLength(lists);
    expect(finished).toHaveLength(1);
    expect((await adapter.getOrderStatus("order-1"))[0]).toMatchObject({ externalOrderId: "430001", status: "submitted" });
  });

  it("reads the queue once per poll for all items, across pages and slices", async () => {
    const { adapter, fake, poller } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    fake.set(430002, {}, "pending");
    expect(await poller.poll()).toMatchObject({ checked: 2, published: 2 });
    expect(fake.lists().map((call) => [call.method, call.query.v, call.query.filter, call.query.page, call.query.page_size])).toEqual([
      ["GET", "2", "active", "1", "200"],
      ["GET", "2", "pending", "1", "200"],
      ["GET", "2", "done", "1", "200"],
    ]);

    const paged = fakeSimplyPrint({ maxPageSize: 1 });
    const client = createSimplyPrintHttpClient({ apiKey: FAKE_API_KEY, companyId: FAKE_COMPANY_ID, fetchImpl: paged.fetchImpl });
    for (const filesystem of ["a", "b", "c"]) await client.addQueueItem({ filesystem, amount: 1 });
    paged.finish(430003);
    expect((await client.listQueueItems()).map((entry) => [entry.item.id, entry.slice])).toEqual([
      [430001, "active"],
      [430002, "active"],
      [430003, "done"],
    ]);
    expect(paged.lists().filter((call) => call.query.filter === "active").map((call) => call.query.page)).toEqual(["1", "2"]);
  });

  it("closes the link and frees the line when an item was denied", async () => {
    const { adapter, fake, published, poller, links } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    await poller.poll();
    fake.set(430001, { approval: { status: "denied" } });
    expect(await poller.poll()).toMatchObject({ checked: 1, published: 1 });
    expect(published.at(-1)).toMatchObject({ status: "unfulfilled", previousStatus: "submitted", orderId: "order-1", skuIds: ["sku-dragon"] });
    expect(await links.listOpen(SIMPLYPRINT_PROVIDER)).toEqual([]);
    expect((await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }])))[0]!.externalOrderId).toBe("430002");
  });

  it("flags a failed print and a missing item for a person, and leaves both lines submitted", async () => {
    const { adapter, fake, published, poller } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));
    fake.set(430001, { failed: 1 });
    fake.vanish(430002);
    const result = await poller.poll();
    expect(result.attention.map((notice) => [notice.queueItemId, notice.printState, notice.skuIds])).toEqual([
      ["430001", "failed", ["sku-dragon"]],
      ["430002", "missing", ["sku-vase"]],
    ]);
    expect(published.map((event) => event.status)).toEqual(["submitted", "submitted"]);
    expect((await poller.poll()).attention).toHaveLength(2);
  });

  it("treats a missing item as cancelled when the adapter is told to", async () => {
    const { adapter, fake, published, poller } = wired({ missingMeansCancelled: true });
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.vanish(430001);
    expect(await poller.poll()).toMatchObject({ checked: 1, published: 1, attention: [] });
    expect(published[0]).toMatchObject({ status: "unfulfilled" });
  });

  it("reports a finished print again when the callback threw, and makes no request with nothing open", async () => {
    const links = createInMemoryProviderOrderLinkRepository();
    const recorder = createProviderOrderStatusRecorder({ links, events: createInMemoryEventBus() });
    const { adapter, fake } = setup({ orderStore: simplyPrintOrderStoreFrom(links), printLog: simplyPrintPrintLogFrom(links) });
    let fail = true;
    const seen: string[] = [];
    const poller = adapter.createStatusPoller({
      links,
      record: (update) => recorder.record(SIMPLYPRINT_PROVIDER, update),
      onPrintFinished: (notice) => {
        if (fail) throw new Error("mail server down");
        seen.push(notice.queueItemId);
      },
    });
    expect(await poller.poll()).toEqual({ checked: 0, published: 0, finished: [], attention: [], failed: [] });
    expect(fake.calls).toHaveLength(0);

    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.finish(430001);
    const first = await poller.poll();
    expect(first.finished).toEqual([]);
    expect(first.failed.map((failure) => failure.queueItemId)).toEqual(["430001"]);
    fail = false;
    expect((await poller.poll()).finished).toHaveLength(1);
    expect(seen).toEqual(["430001"]);
  });

  it("throws, recording nothing, when the queue cannot be read", async () => {
    const { adapter, fake, published, poller } = wired();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.failNextList();
    await expect(poller.poll()).rejects.toBeInstanceOf(SimplyPrintApiError);
    expect(published).toEqual([]);
  });
});

describe("the HTTP client", () => {
  it("puts the company id in the path and reads errors from the envelope", async () => {
    const fake = fakeSimplyPrint();
    const urls: string[] = [];
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      return fake.fetchImpl(input, init);
    }) as typeof fetch;
    const client = createSimplyPrintHttpClient({ apiKey: FAKE_API_KEY, companyId: 5152, fetchImpl });
    await client.addQueueItem({ filesystem: "abc", amount: 1 });
    expect(urls[0]).toBe("https://api.simplyprint.io/5152/queue/AddItem");

    fake.failNextAdd({ httpStatus: 429, message: "You have reached the API rate limit", retryAfter: 214 });
    const limited = (await client.addQueueItem({ filesystem: "abc", amount: 1 }).catch((err: unknown) => err)) as SimplyPrintApiError;
    expect(limited).toBeInstanceOf(SimplyPrintApiError);
    expect([limited.httpStatus, limited.simplyPrintMessage, limited.retryAfterSeconds]).toEqual([429, "You have reached the API rate limit", 214]);

    // HTTP 200 with `status: false` is still an error.
    const gone = (await client.deleteQueueItem(999).catch((err: unknown) => err)) as SimplyPrintApiError;
    expect([gone.httpStatus, gone.simplyPrintMessage]).toEqual([200, "Queue item not found"]);

    const wrongKey = createSimplyPrintHttpClient({ apiKey: "nope", companyId: 5152, fetchImpl });
    expect(((await wrongKey.listQueueItems().catch((err: unknown) => err)) as SimplyPrintApiError).httpStatus).toBe(401);
  });

  it("reads the queue item id under either documented name, and refuses a response with neither", async () => {
    expect(queueItemIdFromAddItemResponse({ status: true, message: null, created_id: 1337 })).toBe(1337);
    expect(queueItemIdFromAddItemResponse({ status: true, message: null, approval_status: "not_required", id: 90817, queue_position: 1 })).toBe(90817);
    expect(queueItemIdFromAddItemResponse({ status: true, created_id: "1337" })).toBeNull();
    expect(queueItemIdFromAddItemResponse(null)).toBeNull();

    const featurePage = fakeSimplyPrint({ idField: "id" });
    expect(await createSimplyPrintHttpClient({ apiKey: FAKE_API_KEY, companyId: FAKE_COMPANY_ID, fetchImpl: featurePage.fetchImpl }).addQueueItem({ filesystem: "abc", amount: 1 })).toEqual({ queueItemId: 430001 });

    const noId = fakeSimplyPrint();
    noId.failNextAdd("no-id");
    await expect(createSimplyPrintHttpClient({ apiKey: FAKE_API_KEY, companyId: FAKE_COMPANY_ID, fetchImpl: noId.fetchImpl }).addQueueItem({ filesystem: "abc", amount: 1 })).rejects.toBeInstanceOf(SimplyPrintUnreadableResponseError);
  });

  it("cuts a note to 255 characters", async () => {
    const fake = fakeSimplyPrint();
    const client = createSimplyPrintHttpClient({ apiKey: FAKE_API_KEY, companyId: FAKE_COMPANY_ID, fetchImpl: fake.fetchImpl });
    const { queueItemId } = await client.addQueueItem({ filesystem: "abc", amount: 1 });
    await client.setQueueItemNote(queueItemId, "x".repeat(400));
    expect(fake.item(queueItemId)!.note).toHaveLength(255);
    expect(simplyPrintQueueNote("o".repeat(300), "sku", 1)).toHaveLength(255);
  });
});

describe("catalog targets", () => {
  it("accepts a file id with an optional queue group and tags", () => {
    expect(parseSimplyPrintCatalogTarget({ fileId: " abc123 " })).toEqual({ ok: true, target: { fileId: "abc123" } });
    expect(parseSimplyPrintCatalogTarget({ fileId: "abc123", queueGroupId: 0, customTagIds: [993], extra: "ignored" })).toEqual({ ok: true, target: { fileId: "abc123", queueGroupId: 0, customTagIds: [993] } });
    expect(parseSimplyPrintCatalogTarget({ fileId: "abc123", customTagIds: [] })).toEqual({ ok: true, target: { fileId: "abc123" } });
  });

  it("refuses a target it cannot queue", () => {
    for (const target of [{}, { fileId: "" }, { fileId: 12 }, { fileId: "abc", queueGroupId: "213" }, { fileId: "abc", queueGroupId: -1 }, { fileId: "abc", queueGroupId: 1.5 }, { fileId: "abc", customTagIds: "993" }, { fileId: "abc", customTagIds: [0] }, { fileId: "abc", customTagIds: ["993"] }]) {
      expect(parseSimplyPrintCatalogTarget(target).ok).toBe(false);
    }
  });

  it("reads targets from the provider catalog mappings", async () => {
    const mappings = createInMemoryProviderCatalogMappingRepository();
    await mappings.save({ skuId: "sku-dragon", provider: SIMPLYPRINT_PROVIDER, target: { fileId: "abc123", queueGroupId: 213 } });
    await mappings.save({ skuId: "sku-broken", provider: SIMPLYPRINT_PROVIDER, target: { file: "abc123" } });
    const resolve = simplyPrintCatalogTargetsFrom(mappings);
    expect(await resolve("sku-dragon")).toEqual({ fileId: "abc123", queueGroupId: 213 });
    await expect(resolve("sku-broken")).rejects.toBeInstanceOf(InvalidCatalogMappingError);
    await expect(resolve("sku-none")).rejects.toBeInstanceOf(MissingCatalogMappingError);
  });
});

describe("webhooks", () => {
  const SECRET = "a-long-made-up-secret";
  const body = (event: string, data: Record<string, unknown> = {}) => JSON.stringify({ webhook_id: 25, event, timestamp: 1776691249, data });

  function receiving(secret: string | undefined = SECRET) {
    const actions: SimplyPrintWebhookAction[] = [];
    const base = wired({ ...(secret ? { webhookSecret: secret } : {}), onWebhookEvent: (action) => void actions.push(action) });
    return { ...base, actions };
  }

  it("refuses every delivery when no secret is configured", async () => {
    const { adapter, actions } = receiving("");
    await expect(adapter.handleWebhookEvent(body("job.done"), "")).rejects.toBeInstanceOf(SimplyPrintWebhookSecretNotConfiguredError);
    await expect(adapter.handleWebhookEvent(body("job.done"), "anything")).rejects.toBeInstanceOf(SimplyPrintWebhookSecretNotConfiguredError);
    expect(actions).toEqual([]);
  });

  it("refuses a missing or wrong secret before reading the body", async () => {
    const { adapter, actions } = receiving();
    for (const header of ["", "wrong", `${SECRET}x`, SECRET.slice(0, -1), SECRET.toUpperCase()]) {
      await expect(adapter.handleWebhookEvent("not even json", header)).rejects.toBeInstanceOf(SimplyPrintWebhookSecretInvalidError);
    }
    expect(actions).toEqual([]);
    expect(simplyPrintWebhookSecretMatches(null, SECRET)).toBe(false);
    expect(simplyPrintWebhookSecretMatches("", "")).toBe(false);
    expect(simplyPrintWebhookSecretMatches(SECRET, SECRET)).toBe(true);
  });

  it("refuses a body that is not SimplyPrint's envelope, even with the right secret", async () => {
    const { adapter } = receiving();
    for (const raw of ["not json", "[]", "null", JSON.stringify({ data: {} })]) await expect(adapter.handleWebhookEvent(raw, SECRET)).rejects.toBeInstanceOf(SimplyPrintWebhookPayloadParseError);
  });

  it("turns a deleted or denied queue item into a closed line, and a job event into a resync", async () => {
    const { adapter, actions, record, published } = receiving();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }, { skuId: "sku-vase", quantity: 1 }]));

    await adapter.handleWebhookEvent(Buffer.from(body("queue.delete_item", { queue_item: { id: 430001, filename: "Sphere.3mf" } })), SECRET);
    await adapter.handleWebhookEvent(body("queue.item_denied", { queue_item: { id: 430002 }, reason: "Rejected by operator", removed: false }), SECRET);
    await adapter.handleWebhookEvent(body("job.done", { job: { id: 5084938, state: "done" } }), SECRET);
    await adapter.handleWebhookEvent(body("filament.update"), SECRET);
    await adapter.handleWebhookEvent(body("test", { company_id: 5152 }), SECRET);
    expect(actions).toEqual([
      { kind: "queue_item_closed", queueItemId: "430001", printState: "cancelled" },
      { kind: "queue_item_closed", queueItemId: "430002", printState: "denied" },
      { kind: "resync" },
      { kind: "ignored" },
      { kind: "ignored" },
    ]);

    // Handing the closed items to the recorder publishes "unfulfilled" and frees the lines.
    for (const action of actions) {
      const update = simplyPrintStatusUpdateFromWebhookAction(action);
      if (update) await record(update);
    }
    expect(published.map((event) => [event.externalOrderId, event.status])).toEqual([
      ["430001", "unfulfilled"],
      ["430002", "unfulfilled"],
    ]);
    expect((await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }])))[0]!.externalOrderId).toBe("430003");
  });

  it("does not treat a printed item being deleted as a cancelled print", async () => {
    const { adapter, fake, actions, poller } = receiving();
    await adapter.submitOrder(order([{ skuId: "sku-dragon", quantity: 1 }]));
    fake.finish(430001);
    await poller.poll();
    await adapter.handleWebhookEvent(body("queue.delete_item", { queue_item: { id: 430001 } }), SECRET);
    expect(actions).toEqual([{ kind: "ignored" }]);
  });

  it("reads every documented job event as a resync and an event without a queue item id too", () => {
    for (const event of ["job.started", "job.paused", "job.resumed", "job.cancelled", "job.done", "job.failed"]) expect(simplyPrintWebhookActionFrom(parseSimplyPrintWebhookEvent(body(event)))).toEqual({ kind: "resync" });
    expect(simplyPrintWebhookActionFrom(parseSimplyPrintWebhookEvent(body("queue.delete_item", {})))).toEqual({ kind: "resync" });
    expect(parseSimplyPrintWebhookEvent(body("job.done", { job: { id: 1 } }))).toEqual({ webhook_id: 25, event: "job.done", timestamp: 1776691249, data: { job: { id: 1 } } });
  });
});
