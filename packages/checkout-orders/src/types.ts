import type { Money } from "@mercatus-liber/core";

export interface OrderLineItem {
  skuId: string;
  quantity: number;
  priceAtPurchase: Money;
}

export type OrderStatus = "pending_payment" | "paid" | "fulfilled" | "cancelled";

export interface ShippingInfo {
  name: string;
  email: string;
  address: string;
}

export interface Order {
  id: string;
  cartId: string;
  idempotencyKey: string;
  items: OrderLineItem[];
  status: OrderStatus;
  shippingInfo: ShippingInfo;
  paymentSessionId: string | null;
  paymentRedirectUrl: string | null;
}

export interface OrderRepository {
  get(id: string): Promise<Order | null>;
  getByIdempotencyKey(key: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

/**
 * The narrowest read dependency checkout-orders has on cart data -- a structural
 * interface, not an import of @mercatus-liber/cart. @mercatus-liber/cart's
 * CartService satisfies this shape already.
 */
export interface CartLookup {
  getCart(id: string): Promise<{ items: { skuId: string; quantity: number; priceSnapshot: Money }[] } | null>;
}

/**
 * The narrowest write dependency checkout-orders has on payments -- a structural
 * interface, not an import of @mercatus-liber/payments. Starting checkout is a
 * synchronous user action needing an immediate session/redirect, so this is a
 * direct call (unlike payment *confirmation*, which arrives asynchronously via
 * the payments.payment.succeeded event -- see the service's event subscription).
 */
export interface PaymentSessionCreator {
  createPaymentSession(input: {
    orderRef: string;
    lineItems: { name: string; unitAmount: Money; quantity: number }[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; redirectUrl: string }>;
}

export class CartNotFoundForCheckoutError extends Error {
  constructor(cartId: string) {
    super(`Cart not found for checkout: ${cartId}`);
    this.name = "CartNotFoundForCheckoutError";
  }
}

export class EmptyCartError extends Error {
  constructor(cartId: string) {
    super(`Cannot check out an empty cart: ${cartId}`);
    this.name = "EmptyCartError";
  }
}

export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Order not found: ${id}`);
    this.name = "OrderNotFoundError";
  }
}
