import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryCartRepository, createCartService, type CartService } from "@mercatus-liber/cart";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryOrderRepository } from "../src/in-memory-repository.js";
import { createCheckoutOrdersService, type CheckoutOrdersService } from "../src/service.js";
import { CartNotFoundForCheckoutError, EmptyCartError } from "../src/types.js";
import type { OrderRepository, PaymentSessionCreator, PricingAdjuster, PricingAdjustment } from "../src/types.js";

describe("checkout-orders service", () => {
  let events: EventBus;
  let catalog: CatalogService;
  let cartService: CartService;
  let checkout: CheckoutOrdersService;
  let orderRepository: OrderRepository;
  let createPaymentSession: ReturnType<typeof vi.fn>;
  const orderPlacedEvents: unknown[] = [];
  const orderPaidEvents: unknown[] = [];
  let activeSkuId: string;
  let cartId: string;

  beforeEach(async () => {
    orderPlacedEvents.length = 0;
    orderPaidEvents.length = 0;
    events = createInMemoryEventBus();
    events.subscribe("checkout.order.placed", async (p) => {
      orderPlacedEvents.push(p);
    });
    events.subscribe("checkout.order.paid", async (p) => {
      orderPaidEvents.push(p);
    });

    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
    const product = await catalog.createProduct({
      slug: "organizer",
      title: "Organizer",
      description: "d",
      identifyingAttributeKeys: ["color"],
    });
    const sku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "red" }],
      price: { amount: 1500, currency: "USD" },
    });
    activeSkuId = sku.id;

    cartService = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events: createInMemoryEventBus(),
    });
    const createdCart = await cartService.createCart();
    cartId = createdCart.id;

    let sessionCounter = 0;
    createPaymentSession = vi.fn(async () => {
      sessionCounter += 1;
      return { sessionId: `sess_${sessionCounter}`, redirectUrl: `https://checkout.example/${sessionCounter}` };
    });
    const payments: PaymentSessionCreator = { createPaymentSession };

    orderRepository = createInMemoryOrderRepository();
    checkout = createCheckoutOrdersService({
      repository: orderRepository,
      cart: cartService,
      payments,
      events,
    });
  });

  it("starts checkout for a non-empty cart: creates a pending_payment order, calls payments with line items, and publishes checkout.order.placed", async () => {
    await cartService.addItem(cartId, activeSkuId, 2);

    const result = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-1",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    expect(result.order.status).toBe("pending_payment");
    expect(result.order.items).toEqual([{ skuId: activeSkuId, quantity: 2, priceAtPurchase: { amount: 1500, currency: "USD" } }]);
    expect(result.order.customerId).toBeNull(); // guest checkout -- customerId omitted
    // No PricingAdjuster wired (promo-02): byte-identical pass-through -- priceAtPurchase
    // matches priceSnapshot exactly (asserted above), discountTotal is zero, no applied code.
    expect(result.order.discountTotal).toEqual({ amount: 0, currency: "USD" });
    expect(result.order.appliedPromotionCode).toBeNull();
    expect(result.redirectUrl).toBe("https://checkout.example/1");
    expect(createPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderRef: result.order.id,
        lineItems: [{ name: `SKU ${activeSkuId}`, unitAmount: { amount: 1500, currency: "USD" }, quantity: 2 }],
      }),
    );
    expect(orderPlacedEvents).toEqual([{ orderId: result.order.id }]);
  });

  it("throws EmptyCartError for a cart with no items", async () => {
    await expect(
      checkout.startCheckout({
        cartId,
        idempotencyKey: "idem-2",
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      }),
    ).rejects.toThrow(EmptyCartError);
  });

  it("throws CartNotFoundForCheckoutError for an unknown cart id", async () => {
    await expect(
      checkout.startCheckout({
        cartId: "missing",
        idempotencyKey: "idem-3",
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      }),
    ).rejects.toThrow(CartNotFoundForCheckoutError);
  });

  it("is idempotent: a retried checkout with the same key returns the same order/redirect without creating a second payment session", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const input = {
      cartId,
      idempotencyKey: "idem-4",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    };
    const first = await checkout.startCheckout(input);
    const second = await checkout.startCheckout(input);

    expect(second.order.id).toBe(first.order.id);
    expect(second.redirectUrl).toBe(first.redirectUrl);
    expect(createPaymentSession).toHaveBeenCalledTimes(1);
  });

  it("transitions an order to paid when payments.payment.succeeded fires for its orderRef, and publishes checkout.order.paid", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-5",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });

    const updated = await checkout.getOrder(order.id);
    expect(updated?.status).toBe("paid");
    expect(orderPaidEvents).toEqual([{ orderId: order.id }]);
  });

  it("is idempotent on a redelivered payment-succeeded event -- only transitions/publishes once", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-6",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });
    await events.publish("payments.payment.succeeded", { sessionId: "sess_1", orderRef: order.id });

    expect(orderPaidEvents).toEqual([{ orderId: order.id }]);
  });

  it("getOrder returns null for an unknown order id", async () => {
    expect(await checkout.getOrder("missing")).toBeNull();
  });

  it("stamps customerId on the order when provided, for account-subsystem lookups", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-7",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-1",
    });
    expect(order.customerId).toBe("cust-1");
  });

  it("repository.listByCustomerId returns only that customer's orders", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order: custOrder } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-8",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-2",
    });
    // A second, guest checkout must not appear in cust-2's results.
    const secondCart = await cartService.createCart();
    await cartService.addItem(secondCart.id, activeSkuId, 1);
    await checkout.startCheckout({
      cartId: secondCart.id,
      idempotencyKey: "idem-9",
      shippingInfo: { name: "B", email: "b@example.com", address: "2 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    const custOrders = await orderRepository.listByCustomerId("cust-2");
    expect(custOrders.map((o) => o.id)).toEqual([custOrder.id]);
  });

  it("service.listOrdersByCustomer delegates to the repository, so consumers can depend on the service alone", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-10",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-3",
    });
    expect((await checkout.listOrdersByCustomer("cust-3")).map((o) => o.id)).toEqual([order.id]);
  });

  it("service.listOrders returns every order across guests and customers, and can filter by status", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);
    const { order: guestOrder } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-11",
      shippingInfo: { name: "Guest", email: "g@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });

    const custCart = await cartService.createCart();
    await cartService.addItem(custCart.id, activeSkuId, 1);
    const { order: custOrder } = await checkout.startCheckout({
      cartId: custCart.id,
      idempotencyKey: "idem-12",
      shippingInfo: { name: "Cust", email: "c@example.com", address: "2 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId: "cust-4",
    });

    const all = await checkout.listOrders();
    expect(all.map((o) => o.id)).toEqual(expect.arrayContaining([guestOrder.id, custOrder.id]));

    await events.publish("payments.payment.succeeded", { sessionId: "sess-x", orderRef: custOrder.id });
    const paidOnly = await checkout.listOrders({ status: "paid" });
    expect(paidOnly.map((o) => o.id)).toEqual([custOrder.id]);

    const pendingOnly = await checkout.listOrders({ status: "pending_payment" });
    expect(pendingOnly.map((o) => o.id)).toContain(guestOrder.id);
    expect(pendingOnly.map((o) => o.id)).not.toContain(custOrder.id);
  });
});

describe("checkout-orders service with a wired PricingAdjuster (promo-02)", () => {
  let events: EventBus;
  let catalog: CatalogService;
  let cartService: CartService;
  let checkout: CheckoutOrdersService;
  let createPaymentSession: ReturnType<typeof vi.fn>;
  let recordApplication: ReturnType<typeof vi.fn>;
  let activeSkuId: string;
  let cartId: string;

  // A fake PricingAdjuster: "SAVE10" grants a flat 10% cart-level discount;
  // any other/missing code is a pass-through with a null appliedCode -- mirrors
  // @mercatus-liber/promotions' own "never throw for an invalid code" contract.
  const pricing: PricingAdjuster = {
    async computeAdjustment(input): Promise<PricingAdjustment> {
      const currency = input.items[0]?.priceSnapshot.currency ?? "USD";
      const subtotal = input.items.reduce((sum, item) => sum + item.priceSnapshot.amount * item.quantity, 0);
      if (input.couponCode === "SAVE10") {
        const discountTotal = Math.round(subtotal * 0.1);
        return {
          items: input.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity, unitAmount: item.priceSnapshot })),
          discountTotal: { amount: discountTotal, currency },
          total: { amount: subtotal - discountTotal, currency },
          appliedCode: "SAVE10",
        };
      }
      return {
        items: input.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity, unitAmount: item.priceSnapshot })),
        discountTotal: { amount: 0, currency },
        total: { amount: subtotal, currency },
        appliedCode: null,
      };
    },
    recordApplication: vi.fn(async () => {}),
  };

  beforeEach(async () => {
    events = createInMemoryEventBus();
    recordApplication = pricing.recordApplication as ReturnType<typeof vi.fn>;
    recordApplication.mockClear();

    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
    const product = await catalog.createProduct({
      slug: "organizer",
      title: "Organizer",
      description: "d",
      identifyingAttributeKeys: ["color"],
    });
    const sku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "red" }],
      price: { amount: 1000, currency: "USD" },
    });
    activeSkuId = sku.id;

    cartService = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events: createInMemoryEventBus(),
    });
    const createdCart = await cartService.createCart();
    cartId = createdCart.id;

    let sessionCounter = 0;
    createPaymentSession = vi.fn(async () => {
      sessionCounter += 1;
      return { sessionId: `sess_${sessionCounter}`, redirectUrl: `https://checkout.example/${sessionCounter}` };
    });
    const payments: PaymentSessionCreator = { createPaymentSession };

    checkout = createCheckoutOrdersService({
      repository: createInMemoryOrderRepository(),
      cart: cartService,
      payments,
      events,
      pricing,
    });
  });

  it("applies a valid couponCode: discounted priceAtPurchase, non-zero discountTotal, appliedPromotionCode set, discounted Stripe lineItems, and recordApplication called", async () => {
    await cartService.addItem(cartId, activeSkuId, 2); // subtotal 2000, 10% off -> 200 discount

    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-promo-1",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      couponCode: "SAVE10",
    });

    // Cart-scope discount: per-line unitAmount stays pass-through, only the
    // totals reflect the discount -- matches @mercatus-liber/promotions'
    // documented cart-scope allocation behavior.
    expect(order.items).toEqual([{ skuId: activeSkuId, quantity: 2, priceAtPurchase: { amount: 1000, currency: "USD" } }]);
    expect(order.discountTotal).toEqual({ amount: 200, currency: "USD" });
    expect(order.appliedPromotionCode).toBe("SAVE10");

    expect(createPaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItems: [{ name: `SKU ${activeSkuId}`, unitAmount: { amount: 1000, currency: "USD" }, quantity: 2 }],
      }),
    );

    expect(recordApplication).toHaveBeenCalledTimes(1);
    expect(recordApplication).toHaveBeenCalledWith({
      orderId: order.id,
      appliedCode: "SAVE10",
      discountAmount: { amount: 200, currency: "USD" },
    });
  });

  it("proceeds at full price for an invalid/unknown couponCode: no discount, no appliedPromotionCode, no error, recordApplication not called", async () => {
    await cartService.addItem(cartId, activeSkuId, 1);

    const { order } = await checkout.startCheckout({
      cartId,
      idempotencyKey: "idem-promo-2",
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      couponCode: "NOT-A-REAL-CODE",
    });

    expect(order.items).toEqual([{ skuId: activeSkuId, quantity: 1, priceAtPurchase: { amount: 1000, currency: "USD" } }]);
    expect(order.discountTotal).toEqual({ amount: 0, currency: "USD" });
    expect(order.appliedPromotionCode).toBeNull();
    expect(recordApplication).not.toHaveBeenCalled();
  });

  it("previewCheckout returns the same PricingAdjustment startCheckout would use, without creating an order or a payment session", async () => {
    await cartService.addItem(cartId, activeSkuId, 3); // subtotal 3000, 10% off -> 300 discount

    const preview = await checkout.previewCheckout({ cartId, couponCode: "SAVE10" });

    expect(preview).toEqual({
      items: [{ skuId: activeSkuId, quantity: 3, unitAmount: { amount: 1000, currency: "USD" } }],
      discountTotal: { amount: 300, currency: "USD" },
      total: { amount: 2700, currency: "USD" },
      appliedCode: "SAVE10",
    });
    expect(createPaymentSession).not.toHaveBeenCalled();
    expect(await checkout.listOrders()).toEqual([]);
  });
});
