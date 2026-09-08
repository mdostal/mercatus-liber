import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCartService, createInMemoryCartRepository, type CartService } from "@mercatus-liber/cart";
import { createCatalogService } from "@mercatus-liber/catalog";
import {
  createCheckoutOrdersService,
  createInMemoryOrderRepository,
  type CheckoutOrdersService,
  type OrderRepository,
} from "@mercatus-liber/checkout-orders";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryCustomerProfileRepository } from "../src/in-memory-repository.js";
import { createAccountService, type AccountService } from "../src/service.js";
import { CustomerNotFoundError } from "../src/types.js";
import type { OrderLookup } from "../src/types.js";

describe("account service", () => {
  let events: EventBus;
  let cart: CartService;
  let checkout: CheckoutOrdersService;
  let orderRepository: OrderRepository;
  let account: AccountService;
  let activeSkuId: string;

  /** Adds `quantity` of the shared demo SKU to a fresh cart and checks out, returning the created order id. */
  async function checkoutWithNewCart(customerId: string | undefined, quantity: number): Promise<string> {
    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, activeSkuId, quantity);
    const { order } = await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
      customerId,
    });
    return order.id;
  }

  beforeEach(async () => {
    events = createInMemoryEventBus();

    const persistence = createSqliteAdapter(":memory:");
    const catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
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

    cart = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog,
      events: createInMemoryEventBus(),
    });

    orderRepository = createInMemoryOrderRepository();
    checkout = createCheckoutOrdersService({
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

    // The small adapter object the reference storefront wires over its
    // concrete checkout-orders instances -- see types.ts's OrderLookup doc.
    const orderLookup: OrderLookup = {
      getOrder: (id) => checkout.getOrder(id),
      listOrdersByCustomer: (customerId) => orderRepository.listByCustomerId(customerId),
    };

    account = createAccountService({
      profiles: createInMemoryCustomerProfileRepository(),
      orders: orderLookup,
      events,
    });
  });

  it("creates, gets, and updates a customer profile", async () => {
    const profile = await account.createProfile({ email: "a@example.com", name: "A" });
    expect(await account.getProfile(profile.id)).toEqual(profile);
    expect(await account.getProfileByEmail("a@example.com")).toEqual(profile);

    const updated = await account.updateProfile(profile.id, { name: "A Updated" });
    expect(updated.name).toBe("A Updated");
  });

  it("throws CustomerNotFoundError when updating an unknown profile", async () => {
    await expect(account.updateProfile("missing", { name: "x" })).rejects.toThrow(CustomerNotFoundError);
  });

  it("listOrders returns summaries for exactly that customer's orders, with correct itemCount", async () => {
    await checkoutWithNewCart("cust-1", 2);
    // A guest order (no customerId) must never leak into cust-1's dashboard.
    await checkoutWithNewCart(undefined, 5);

    const summaries = await account.listOrders("cust-1");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ status: "pending_payment", itemCount: 2 });
  });

  it("logs a per-customer activity entry when checkout.order.paid fires for one of their orders", async () => {
    const orderId = await checkoutWithNewCart("cust-2", 1);
    await events.publish("checkout.order.paid", { orderId });

    const activity = await account.listRecentActivity("cust-2");
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ orderId, status: "paid" });
  });

  it("does not attribute activity to any customer when the paid order is a guest order (customerId null)", async () => {
    const orderId = await checkoutWithNewCart(undefined, 1);
    await events.publish("checkout.order.paid", { orderId });

    expect(await account.listRecentActivity("cust-2")).toEqual([]);
  });
});
