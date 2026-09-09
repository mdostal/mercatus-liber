import {
  createCheckoutOrdersService,
  createInMemoryOrderRepository,
  type CartLookup,
  type CheckoutOrdersService,
  type Order,
  type OrderRepository,
  type PaymentSessionCreator,
} from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type Money } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createManualFulfillmentAdapter, type ManualFulfillmentAdapter } from "../src/manual-adapter.js";
import { assertCheckoutOrdersServiceSatisfiesOrderLookup } from "../src/order-lookup-compat.js";
import {
  createInMemoryFulfillmentRoutingRepository,
  type FulfillmentRoutingRepository,
} from "../src/routing-repository.js";
import {
  createFulfillmentService,
  ManualStatusUpdateNotSupportedError,
  NoAdapterForProviderError,
  OrderNotFoundForFulfillmentError,
  type FulfillmentService,
} from "../src/service.js";
import {
  FulfillmentLineNotFoundError,
  MANUAL_FULFILLMENT_PROVIDER,
  type FulfillmentAdapter,
  type FulfillmentLineRecord,
  type OrderLookup,
} from "../src/types.js";

const USD = (amount: number): Money => ({ amount, currency: "USD" });

/** Never invoked in these tests -- startCheckout is never called, orders are saved to the repository directly. */
const unusedCartLookup: CartLookup = {
  async getCart() {
    throw new Error("not used in these tests");
  },
};

/** Never invoked in these tests either, for the same reason. */
const unusedPaymentSessionCreator: PaymentSessionCreator = {
  async createPaymentSession() {
    throw new Error("not used in these tests");
  },
};

function makeOrder(overrides: Partial<Order> & { id: string; items: Order["items"] }): Order {
  return {
    cartId: `cart-for-${overrides.id}`,
    idempotencyKey: `idem-for-${overrides.id}`,
    status: "paid",
    shippingInfo: { name: "Ada Lovelace", email: "ada@example.com", address: "1 Analytical Engine Way" },
    paymentSessionId: null,
    paymentRedirectUrl: null,
    customerId: null,
    discountTotal: USD(0),
    appliedPromotionCode: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("createInMemoryFulfillmentRoutingRepository", () => {
  let routing: FulfillmentRoutingRepository;

  beforeEach(() => {
    routing = createInMemoryFulfillmentRoutingRepository();
  });

  it("resolves 'manual' by default for a SKU with no explicit mapping", async () => {
    expect(await routing.getProviderForSku("sku-never-mapped")).toBe(MANUAL_FULFILLMENT_PROVIDER);
    expect(await routing.getProviderForSku("sku-never-mapped")).toBe("manual");
  });

  it("resolves the explicitly mapped provider once one is set, and leaves other SKUs on the default", async () => {
    await routing.setProviderForSku("sku-mug", "printful");

    expect(await routing.getProviderForSku("sku-mug")).toBe("printful");
    expect(await routing.getProviderForSku("sku-unrelated")).toBe(MANUAL_FULFILLMENT_PROVIDER);
  });

  it("listMappings reports only explicit mappings, never the implicit manual default", async () => {
    await routing.setProviderForSku("sku-mug", "printful");
    await routing.setProviderForSku("sku-shirt", "printify");

    const mappings = await routing.listMappings();
    expect(mappings.sort((a, b) => a.skuId.localeCompare(b.skuId))).toEqual([
      { skuId: "sku-mug", provider: "printful" },
      { skuId: "sku-shirt", provider: "printify" },
    ]);
  });

  it("a later setProviderForSku call overwrites the previous mapping for that SKU", async () => {
    await routing.setProviderForSku("sku-mug", "printful");
    await routing.setProviderForSku("sku-mug", "printify");

    expect(await routing.getProviderForSku("sku-mug")).toBe("printify");
    expect(await routing.listMappings()).toEqual([{ skuId: "sku-mug", provider: "printify" }]);
  });
});

describe("createManualFulfillmentAdapter", () => {
  let manual: ManualFulfillmentAdapter;

  beforeEach(() => {
    manual = createManualFulfillmentAdapter();
  });

  it("submitOrder produces one real FulfillmentLineRecord per line, status 'submitted' (awaiting manual fulfillment), no externalOrderId", async () => {
    const records = await manual.submitOrder({
      orderId: "order-1",
      items: [
        { skuId: "sku-mug", quantity: 2 },
        { skuId: "sku-shirt", quantity: 1 },
      ],
    });

    expect(records).toEqual<FulfillmentLineRecord[]>([
      {
        orderId: "order-1",
        skuId: "sku-mug",
        provider: "manual",
        externalOrderId: null,
        status: "submitted",
        trackingNumber: null,
        trackingUrl: null,
      },
      {
        orderId: "order-1",
        skuId: "sku-shirt",
        provider: "manual",
        externalOrderId: null,
        status: "submitted",
        trackingNumber: null,
        trackingUrl: null,
      },
    ]);
  });

  it("getOrderStatus reads back exactly what submitOrder created", async () => {
    await manual.submitOrder({ orderId: "order-2", items: [{ skuId: "sku-mug", quantity: 1 }] });

    const status = await manual.getOrderStatus("order-2");
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ orderId: "order-2", skuId: "sku-mug", status: "submitted" });
  });

  it("getOrderStatus for an order it never submitted returns an empty array, not an error", async () => {
    await expect(manual.getOrderStatus("never-submitted")).resolves.toEqual([]);
  });

  it("submitOrder is additive across calls for the same order (a later line join doesn't drop earlier ones)", async () => {
    await manual.submitOrder({ orderId: "order-3", items: [{ skuId: "sku-mug", quantity: 1 }] });
    await manual.submitOrder({ orderId: "order-3", items: [{ skuId: "sku-shirt", quantity: 1 }] });

    const status = await manual.getOrderStatus("order-3");
    expect(status.map((r) => r.skuId).sort()).toEqual(["sku-mug", "sku-shirt"]);
  });

  it("markShipped transitions the record to 'shipped' and records tracking info", async () => {
    await manual.submitOrder({ orderId: "order-4", items: [{ skuId: "sku-mug", quantity: 1 }] });

    const shipped = await manual.markShipped("order-4", "sku-mug", {
      trackingNumber: "1Z999",
      trackingUrl: "https://track.example/1Z999",
    });

    expect(shipped).toMatchObject({
      orderId: "order-4",
      skuId: "sku-mug",
      status: "shipped",
      trackingNumber: "1Z999",
      trackingUrl: "https://track.example/1Z999",
    });

    const status = await manual.getOrderStatus("order-4");
    expect(status[0]).toMatchObject({ status: "shipped", trackingNumber: "1Z999" });
  });

  it("markShipped without tracking info still transitions status, leaving tracking fields null", async () => {
    await manual.submitOrder({ orderId: "order-5", items: [{ skuId: "sku-mug", quantity: 1 }] });

    const shipped = await manual.markShipped("order-5", "sku-mug");
    expect(shipped).toMatchObject({ status: "shipped", trackingNumber: null, trackingUrl: null });
  });

  it("markShipped on an unknown (orderId, skuId) pair throws FulfillmentLineNotFoundError", async () => {
    await expect(manual.markShipped("no-such-order", "sku-mug")).rejects.toThrow(FulfillmentLineNotFoundError);

    await manual.submitOrder({ orderId: "order-6", items: [{ skuId: "sku-mug", quantity: 1 }] });
    await expect(manual.markShipped("order-6", "sku-other")).rejects.toThrow(FulfillmentLineNotFoundError);
  });

  it("returned records are defensive copies -- mutating one never corrupts the adapter's own stored state", async () => {
    const [record] = await manual.submitOrder({ orderId: "order-7", items: [{ skuId: "sku-mug", quantity: 1 }] });
    record!.status = "delivered";
    record!.trackingNumber = "tampered";

    const status = await manual.getOrderStatus("order-7");
    expect(status[0]).toMatchObject({ status: "submitted", trackingNumber: null });
  });
});

describe("createFulfillmentService", () => {
  let orders: OrderLookup;
  let routing: FulfillmentRoutingRepository;
  let manual: ManualFulfillmentAdapter;
  let service: FulfillmentService;
  const knownOrders = new Map<string, { id: string; items: { skuId: string; quantity: number }[] }>();

  beforeEach(() => {
    knownOrders.clear();
    orders = {
      async getOrder(id) {
        return knownOrders.get(id) ?? null;
      },
    };
    routing = createInMemoryFulfillmentRoutingRepository();
    manual = createManualFulfillmentAdapter();
    service = createFulfillmentService({ orders, routing, adapters: { manual } });
  });

  it("submitOrder routes every line to 'manual' by default and returns one record per line", async () => {
    knownOrders.set("order-1", {
      id: "order-1",
      items: [
        { skuId: "sku-mug", quantity: 2 },
        { skuId: "sku-shirt", quantity: 1 },
      ],
    });

    const records = await service.submitOrder("order-1");
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.provider === "manual" && r.status === "submitted")).toBe(true);
  });

  it("submitOrder throws OrderNotFoundForFulfillmentError for an unknown order", async () => {
    await expect(service.submitOrder("does-not-exist")).rejects.toThrow(OrderNotFoundForFulfillmentError);
  });

  it("submitOrder throws NoAdapterForProviderError when a line is routed to a provider with no configured adapter", async () => {
    knownOrders.set("order-2", { id: "order-2", items: [{ skuId: "sku-mug", quantity: 1 }] });
    await routing.setProviderForSku("sku-mug", "printful");

    await expect(service.submitOrder("order-2")).rejects.toThrow(NoAdapterForProviderError);
  });

  it("listForOrder aggregates records across every provider a real order's lines are routed to", async () => {
    const printful: FulfillmentAdapter = {
      async submitOrder(input) {
        return input.items.map((item) => ({
          orderId: input.orderId,
          skuId: item.skuId,
          provider: "printful",
          externalOrderId: `pf_${item.skuId}`,
          status: "submitted",
          trackingNumber: null,
          trackingUrl: null,
        }));
      },
      async getOrderStatus(orderId) {
        return [
          {
            orderId,
            skuId: "sku-mug",
            provider: "printful",
            externalOrderId: "pf_sku-mug",
            status: "shipped",
            trackingNumber: "PF123",
            trackingUrl: "https://track.example/PF123",
          },
        ];
      },
    };
    service = createFulfillmentService({ orders, routing, adapters: { manual, printful } });

    knownOrders.set("order-3", {
      id: "order-3",
      items: [
        { skuId: "sku-mug", quantity: 1 }, // routed to printful below
        { skuId: "sku-shirt", quantity: 1 }, // stays manual (default)
      ],
    });
    await routing.setProviderForSku("sku-mug", "printful");
    await service.submitOrder("order-3");

    const records = await service.listForOrder("order-3");
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.skuId === "sku-mug")).toMatchObject({ provider: "printful", status: "shipped" });
    expect(records.find((r) => r.skuId === "sku-shirt")).toMatchObject({ provider: "manual", status: "submitted" });
  });

  it("markLineShipped delegates to the resolved adapter's markShipped and returns the updated record", async () => {
    knownOrders.set("order-4", { id: "order-4", items: [{ skuId: "sku-mug", quantity: 1 }] });
    await service.submitOrder("order-4");

    const shipped = await service.markLineShipped("order-4", "sku-mug", { trackingNumber: "1Z1" });
    expect(shipped).toMatchObject({ status: "shipped", trackingNumber: "1Z1" });
  });

  it("markLineShipped throws ManualStatusUpdateNotSupportedError when the routed provider's adapter has no markShipped capability", async () => {
    const webhookOnlyAdapter: FulfillmentAdapter = {
      async submitOrder(input) {
        return input.items.map((item) => ({
          orderId: input.orderId,
          skuId: item.skuId,
          provider: "printful",
          externalOrderId: `pf_${item.skuId}`,
          status: "submitted",
          trackingNumber: null,
          trackingUrl: null,
        }));
      },
      async getOrderStatus() {
        return [];
      },
      async handleWebhookEvent() {
        // real providers push updates this way instead
      },
    };
    service = createFulfillmentService({ orders, routing, adapters: { manual, printful: webhookOnlyAdapter } });
    await routing.setProviderForSku("sku-mug", "printful");

    await expect(service.markLineShipped("order-5", "sku-mug")).rejects.toThrow(ManualStatusUpdateNotSupportedError);
  });
});

describe("OrderLookup structural compatibility with checkout-orders' real service", () => {
  let orderRepository: OrderRepository;
  let checkout: CheckoutOrdersService;

  beforeEach(() => {
    orderRepository = createInMemoryOrderRepository();
    checkout = createCheckoutOrdersService({
      repository: orderRepository,
      cart: unusedCartLookup,
      payments: unusedPaymentSessionCreator,
      events: createInMemoryEventBus(),
    });
  });

  it("assigns a real CheckoutOrdersService directly to a variable typed OrderLookup -- zero adapter/glue code, a compile error if the shapes ever diverge", async () => {
    await orderRepository.save(
      makeOrder({
        id: "order-real-1",
        items: [
          { skuId: "sku-mug", quantity: 2, priceAtPurchase: USD(1500) },
          { skuId: "sku-shirt", quantity: 1, priceAtPurchase: USD(2500) },
        ],
      }),
    );

    // The actual proof: no wrapper object, no field renames -- `checkout` (a real,
    // live CheckoutOrdersService instance) is assigned directly. This line alone
    // would fail to compile if OrderLookup ever asked for something checkout-orders'
    // real Order/CheckoutOrdersService shape didn't provide.
    const orders: OrderLookup = checkout;

    const order = await orders.getOrder("order-real-1");
    expect(order).not.toBeNull();
    // Runtime returns the real (wider) Order object -- OrderLookup only narrows the
    // *type*, not the actual shape at runtime, so assert on the fields OrderLookup
    // declares rather than exact deep equality against a stripped-down object.
    expect(order!.id).toBe("order-real-1");
    expect(order!.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity }))).toEqual([
      { skuId: "sku-mug", quantity: 2 },
      { skuId: "sku-shirt", quantity: 1 },
    ]);
  });

  it("also passes the same real service through the src/order-lookup-compat.ts compile-time proof function", async () => {
    await orderRepository.save(makeOrder({ id: "order-real-2", items: [{ skuId: "sku-mug", quantity: 1, priceAtPurchase: USD(1500) }] }));

    const orders = assertCheckoutOrdersServiceSatisfiesOrderLookup(checkout);
    const order = await orders.getOrder("order-real-2");

    // Same runtime-is-wider-than-the-type caveat as above -- assert the OrderLookup-declared fields.
    expect(order!.id).toBe("order-real-2");
    expect(order!.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity }))).toEqual([
      { skuId: "sku-mug", quantity: 1 },
    ]);
  });

  it("end-to-end: a real CheckoutOrdersService wired straight into FulfillmentService as OrderLookup, no glue", async () => {
    await orderRepository.save(
      makeOrder({ id: "order-real-3", items: [{ skuId: "sku-mug", quantity: 3, priceAtPurchase: USD(1500) }] }),
    );

    const service = createFulfillmentService({
      orders: checkout, // structural: CheckoutOrdersService used directly wherever OrderLookup is expected
      routing: createInMemoryFulfillmentRoutingRepository(),
      adapters: { manual: createManualFulfillmentAdapter() },
    });

    const records = await service.submitOrder("order-real-3");
    expect(records).toEqual<FulfillmentLineRecord[]>([
      {
        orderId: "order-real-3",
        skuId: "sku-mug",
        provider: "manual",
        externalOrderId: null,
        status: "submitted",
        trackingNumber: null,
        trackingUrl: null,
      },
    ]);
  });

  it("getOrder returns null for an order the real repository doesn't have -- same contract OrderLookup declares", async () => {
    const orders: OrderLookup = checkout;
    await expect(orders.getOrder("no-such-order")).resolves.toBeNull();
  });
});
