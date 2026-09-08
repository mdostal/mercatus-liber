import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import { CartNotFoundForCheckoutError, EmptyCartError } from "./types.js";
import type {
  CartLookup,
  Order,
  OrderRepository,
  PaymentSessionCreator,
  ShippingInfo,
} from "./types.js";

export interface StartCheckoutInput {
  cartId: string;
  idempotencyKey: string;
  shippingInfo: ShippingInfo;
  successUrl: string;
  cancelUrl: string;
  /** Omit or pass null/undefined for guest checkout. */
  customerId?: string | null;
}

export interface CheckoutResult {
  order: Order;
  redirectUrl: string;
}

export interface CheckoutOrdersService {
  startCheckout(input: StartCheckoutInput): Promise<CheckoutResult>;
  getOrder(id: string): Promise<Order | null>;
  /** Delegates directly to the repository -- exposed here so consumers (e.g. the account subsystem's OrderLookup) can depend on this service alone instead of reaching into the repository. */
  listOrdersByCustomer(customerId: string): Promise<Order[]>;
}

export function createCheckoutOrdersService(deps: {
  repository: OrderRepository;
  cart: CartLookup;
  payments: PaymentSessionCreator;
  events: EventBus;
}): CheckoutOrdersService {
  const { repository, cart, payments, events } = deps;

  // React to async payment confirmation -- never a direct call from startCheckout.
  events.subscribe<{ sessionId: string; orderRef: string | null }>(
    "payments.payment.succeeded",
    async ({ orderRef }) => {
      if (!orderRef) return;
      const order = await repository.get(orderRef);
      // Idempotent: a redelivered webhook event that already transitioned this
      // order is a no-op, not a re-publish.
      if (!order || order.status !== "pending_payment") return;
      const paid: Order = { ...order, status: "paid" };
      await repository.save(paid);
      await events.publish("checkout.order.paid", { orderId: paid.id });
    },
  );

  return {
    async startCheckout(input: StartCheckoutInput): Promise<CheckoutResult> {
      // Idempotency: a retried checkout with the same key returns the existing
      // order + redirect rather than creating a duplicate order or a second
      // Stripe session (no double-charge).
      const existing = await repository.getByIdempotencyKey(input.idempotencyKey);
      if (existing && existing.paymentRedirectUrl) {
        return { order: existing, redirectUrl: existing.paymentRedirectUrl };
      }

      const shopperCart = await cart.getCart(input.cartId);
      if (!shopperCart) throw new CartNotFoundForCheckoutError(input.cartId);
      if (shopperCart.items.length === 0) throw new EmptyCartError(input.cartId);

      const orderId = randomUUID();
      const order: Order = {
        id: orderId,
        cartId: input.cartId,
        idempotencyKey: input.idempotencyKey,
        items: shopperCart.items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          priceAtPurchase: item.priceSnapshot,
        })),
        status: "pending_payment",
        shippingInfo: input.shippingInfo,
        paymentSessionId: null,
        paymentRedirectUrl: null,
        customerId: input.customerId ?? null,
      };
      await repository.save(order);
      await events.publish("checkout.order.placed", { orderId });

      const session = await payments.createPaymentSession({
        orderRef: orderId,
        lineItems: shopperCart.items.map((item) => ({
          name: `SKU ${item.skuId}`,
          unitAmount: item.priceSnapshot,
          quantity: item.quantity,
        })),
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });

      const withSession: Order = {
        ...order,
        paymentSessionId: session.sessionId,
        paymentRedirectUrl: session.redirectUrl,
      };
      await repository.save(withSession);

      return { order: withSession, redirectUrl: session.redirectUrl };
    },

    async getOrder(id: string): Promise<Order | null> {
      return repository.get(id);
    },

    async listOrdersByCustomer(customerId: string): Promise<Order[]> {
      return repository.listByCustomerId(customerId);
    },
  };
}
