import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCatalogService } from "@mercatus-liber/catalog";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryInventoryAdapter } from "../src/in-memory-adapter.js";
import { registerInventorySync } from "../src/subscriber.js";
import type { InventoryAdapter } from "../src/types.js";

describe("registerInventorySync", () => {
  let events: EventBus;
  let inventory: InventoryAdapter;
  let skuId: string;
  let checkoutFor: (customerLabel: string) => Promise<{ orderId: string; cartId: string }>;

  beforeEach(async () => {
    events = createInMemoryEventBus();
    inventory = createInMemoryInventoryAdapter();

    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events });
    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events: createInMemoryEventBus() });

    const orderRepository = createInMemoryOrderRepository();
    const checkout = createCheckoutOrdersService({
      repository: orderRepository,
      cart,
      payments: {
        createPaymentSession: async (input) => ({
          sessionId: `sess_${input.orderRef}`,
          redirectUrl: `https://checkout.example/${input.orderRef}`,
        }),
      },
      events,
    });

    registerInventorySync({ events, inventory, orders: checkout }); // structural typing -- checkout-orders never imported by src/, only by this test

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
    skuId = sku.id;
    await inventory.setStock(skuId, 10); // seed real stock after creation (init-at-0 already fired)

    checkoutFor = async () => {
      const shopperCart = await cart.createCart();
      await cart.addItem(shopperCart.id, skuId, 3);
      const { order } = await checkout.startCheckout({
        cartId: shopperCart.id,
        idempotencyKey: shopperCart.id,
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      });
      return { orderId: order.id, cartId: shopperCart.id };
    };
  });

  it("initializes stock at onHand=0/reserved=0 when catalog.sku.created fires", async () => {
    const events2 = createInMemoryEventBus();
    const inventory2 = createInMemoryInventoryAdapter();
    const persistence2 = createSqliteAdapter(":memory:");
    const catalog2 = createCatalogService({ persistence: persistence2, events: events2 });
    registerInventorySync({ events: events2, inventory: inventory2, orders: { getOrder: async () => null } });

    const product2 = await catalog2.createProduct({ slug: "p", title: "P", description: "d", identifyingAttributeKeys: [] });
    const sku2 = await catalog2.createSku({ productId: product2.id, identifyingAttributes: [], price: { amount: 100, currency: "USD" } });

    expect(await inventory2.getStock(sku2.id)).toEqual({ skuId: sku2.id, onHand: 0, reserved: 0 });
  });

  it("reserves stock for each line item when checkout.order.placed fires", async () => {
    await checkoutFor("cust-1");
    expect(await inventory.getStock(skuId)).toEqual({ skuId, onHand: 10, reserved: 3 });
  });

  it("commits (decrements both onHand and reserved) when checkout.order.paid fires", async () => {
    const { orderId } = await checkoutFor("cust-2");
    // Publishing payments.payment.succeeded already cascades to
    // checkout.order.paid via checkout-orders' own internal subscriber --
    // do not also publish checkout.order.paid manually (that would fire
    // inventory's handler twice).
    await events.publish("payments.payment.succeeded", { sessionId: "irrelevant", orderRef: orderId });

    expect(await inventory.getStock(skuId)).toEqual({ skuId, onHand: 7, reserved: 0 });
  });

  it("releases (restores reserved, leaves onHand alone) when payments.payment.failed fires", async () => {
    const { orderId } = await checkoutFor("cust-3");
    expect(await inventory.getStock(skuId)).toEqual({ skuId, onHand: 10, reserved: 3 }); // reserved after placing

    await events.publish("payments.payment.failed", { sessionId: "irrelevant", orderRef: orderId });

    expect(await inventory.getStock(skuId)).toEqual({ skuId, onHand: 10, reserved: 0 });
  });
});
