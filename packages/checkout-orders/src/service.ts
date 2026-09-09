import { randomUUID } from "node:crypto";
import type { EventBus, Money } from "@mercatus-liber/core";
import { CartNotFoundForCheckoutError, EmptyCartError } from "./types.js";
import type {
  CartLookup,
  Order,
  OrderRepository,
  OrderStatus,
  PaymentSessionCreator,
  PricingAdjuster,
  PricingAdjustment,
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
  /** Omit or pass null/undefined to check out at full (pre-discount) price. An unknown/ineligible code never throws -- see PricingAdjuster. */
  couponCode?: string | null;
}

export interface CheckoutResult {
  order: Order;
  redirectUrl: string;
}

export interface PreviewCheckoutInput {
  cartId: string;
  couponCode?: string | null;
}

export interface CheckoutOrdersService {
  startCheckout(input: StartCheckoutInput): Promise<CheckoutResult>;
  getOrder(id: string): Promise<Order | null>;
  /** Delegates directly to the repository -- exposed here so consumers (e.g. the account subsystem's OrderLookup) can depend on this service alone instead of reaching into the repository. */
  listOrdersByCustomer(customerId: string): Promise<Order[]>;
  /** All orders, guest or not -- the admin-view read path (see admin-janus-dogfood epic). */
  listOrders(filter?: { status?: OrderStatus }): Promise<Order[]>;
  /** Same PricingAdjustment computation startCheckout would use, without creating an order or a payment session -- for cart/checkout-summary display. */
  previewCheckout(input: PreviewCheckoutInput): Promise<PricingAdjustment>;
}

/**
 * Used when no PricingAdjuster is wired at services.ts DI time -- unitAmount
 * === priceSnapshot, discountTotal zero, appliedCode null. Every deployment
 * that hasn't adopted promotions gets byte-identical behavior to before this
 * dependency existed.
 */
function passThroughAdjustment(items: { skuId: string; quantity: number; priceSnapshot: Money }[]): PricingAdjustment {
  const currency = items[0]?.priceSnapshot.currency ?? "USD";
  const total = items.reduce((sum, item) => sum + item.priceSnapshot.amount * item.quantity, 0);
  return {
    items: items.map((item) => ({ skuId: item.skuId, quantity: item.quantity, unitAmount: item.priceSnapshot })),
    discountTotal: { amount: 0, currency },
    total: { amount: total, currency },
    appliedCode: null,
  };
}

export function createCheckoutOrdersService(deps: {
  repository: OrderRepository;
  cart: CartLookup;
  payments: PaymentSessionCreator;
  events: EventBus;
  pricing?: PricingAdjuster;
}): CheckoutOrdersService {
  const { repository, cart, payments, events, pricing } = deps;

  async function computeAdjustment(
    items: { skuId: string; quantity: number; priceSnapshot: Money }[],
    couponCode: string | null | undefined,
  ): Promise<PricingAdjustment> {
    if (!pricing) return passThroughAdjustment(items);
    return pricing.computeAdjustment({ items, couponCode: couponCode ?? null });
  }

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

      const adjustment = await computeAdjustment(shopperCart.items, input.couponCode);
      const unitAmountBySku = new Map(adjustment.items.map((item) => [item.skuId, item.unitAmount]));

      const orderId = randomUUID();
      const order: Order = {
        id: orderId,
        cartId: input.cartId,
        idempotencyKey: input.idempotencyKey,
        items: shopperCart.items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          priceAtPurchase: unitAmountBySku.get(item.skuId) ?? item.priceSnapshot,
          // Additive passthrough (see OrderLineItem's doc comment) -- pricing
          // is keyed by skuId only and doesn't carry customizationNote, so
          // it's read straight off the cart line here, not off `adjustment`.
          ...(item.customizationNote ? { customizationNote: item.customizationNote } : {}),
        })),
        status: "pending_payment",
        shippingInfo: input.shippingInfo,
        paymentSessionId: null,
        paymentRedirectUrl: null,
        customerId: input.customerId ?? null,
        discountTotal: adjustment.discountTotal,
        appliedPromotionCode: adjustment.appliedCode,
        createdAt: new Date().toISOString(),
      };
      await repository.save(order);

      if (adjustment.appliedCode !== null) {
        await pricing?.recordApplication?.({
          orderId,
          appliedCode: adjustment.appliedCode,
          discountAmount: adjustment.discountTotal,
        });
      }

      await events.publish("checkout.order.placed", { orderId });

      const session = await payments.createPaymentSession({
        orderRef: orderId,
        lineItems: shopperCart.items.map((item) => ({
          name: `SKU ${item.skuId}`,
          unitAmount: unitAmountBySku.get(item.skuId) ?? item.priceSnapshot,
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

    async listOrders(filter?: { status?: OrderStatus }): Promise<Order[]> {
      return repository.listAll(filter);
    },

    async previewCheckout(input: PreviewCheckoutInput): Promise<PricingAdjustment> {
      const shopperCart = await cart.getCart(input.cartId);
      if (!shopperCart) throw new CartNotFoundForCheckoutError(input.cartId);
      if (shopperCart.items.length === 0) throw new EmptyCartError(input.cartId);
      return computeAdjustment(shopperCart.items, input.couponCode);
    },
  };
}
