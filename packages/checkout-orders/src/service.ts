import { randomUUID } from "node:crypto";
import { lifecycle, resolveRegion, type EventBus, type Money } from "@mercatus-liber/core";
import { CartNotFoundForCheckoutError, EmptyCartError, ItemsNotOnSaleError, NoShippingCountryError, QuoteRequiredError } from "./types.js";
import type {
  CartLookup,
  Order,
  OrderRepository,
  OrderStatus,
  PaymentSessionCreator,
  PaymentSucceededPayload,
  PricingAdjuster,
  PricingAdjustment,
  LineItemNamer,
  SaleWindowLookup,
  ShippingInfo,
  ShippingQuoter,
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
  /**
   * Have the payment page collect the shipping address, with its own address
   * lookup, instead of the store's form. shippingInfo then needs only what
   * shipping is quoted from (usually countryCode) and, if known, the email;
   * pass "" for name and address. When the payment succeeds, the address,
   * name, email and phone the payment page collected replace shippingInfo's,
   * before checkout.order.paid is published.
   */
  collectAddress?: {
    /** Countries the shopper may pick. Defaults to shippingInfo.countryCode, the country shipping was quoted for. */
    allowedCountries?: string[];
    /** Also ask for a phone number. */
    phone?: boolean;
  };
}

/** The order's shippingInfo with what the payment page collected laid over it. */
function withCollectedAddress(current: ShippingInfo, payment: PaymentSucceededPayload): ShippingInfo {
  const collected = payment.shippingAddress;
  if (!collected) return current;
  const region = resolveRegion(collected.countryCode, collected.state);
  const name = collected.name ?? payment.customer?.name ?? current.name;
  const email = payment.customer?.email ?? current.email;
  const phone = payment.customer?.phone ?? current.phone;
  const stateCode = region?.code ?? collected.state ?? undefined;
  return {
    name,
    email,
    address: [collected.line1, collected.line2, collected.city, [stateCode, collected.postalCode].filter(Boolean).join(" "), collected.countryCode].filter(Boolean).join(", "),
    street1: collected.line1,
    ...(collected.line2 ? { street2: collected.line2 } : {}),
    city: collected.city,
    ...(stateCode ? { stateCode } : {}),
    ...(region ? { stateName: region.name } : {}),
    postalCode: collected.postalCode,
    countryCode: collected.countryCode.toUpperCase(),
    ...(phone ? { phone } : {}),
  };
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
  /** Prices shipping at checkout. Without it, no shipping is charged. */
  shipping?: ShippingQuoter;
  /** Names line items on the payment page. Without it, lines read "SKU <id>". */
  nameLineItem?: LineItemNamer;
  /** Checks each line is on sale now (active, inside its and its product's window). Without it, no check. */
  saleWindows?: SaleWindowLookup;
  /** The clock sale windows are checked against. Default: the real time. */
  now?: () => Date;
}): CheckoutOrdersService {
  const { repository, cart, payments, events, pricing, shipping, nameLineItem, saleWindows } = deps;
  const now = deps.now ?? (() => new Date());

  async function notOnSale(skuIds: string[]): Promise<string[]> {
    if (!saleWindows) return [];
    const refused: string[] = [];
    for (const skuId of new Set(skuIds)) {
      const sku = await saleWindows.getSku(skuId);
      const product = sku && saleWindows.getProduct ? await saleWindows.getProduct(sku.productId) : null;
      const dates = product ? [{ activeFrom: product.activeFrom ?? null, activeTo: product.activeTo ?? null }] : [];
      if (!sku || lifecycle([sku, ...dates], now()).state !== "active") refused.push(skuId);
    }
    return refused;
  }

  async function computeAdjustment(
    items: { skuId: string; quantity: number; priceSnapshot: Money }[],
    couponCode: string | null | undefined,
  ): Promise<PricingAdjustment> {
    if (!pricing) return passThroughAdjustment(items);
    return pricing.computeAdjustment({ items, couponCode: couponCode ?? null });
  }

  // React to async payment confirmation -- never a direct call from startCheckout.
  events.subscribe<PaymentSucceededPayload>(
    "payments.payment.succeeded",
    async (payment) => {
      const { orderRef } = payment;
      if (!orderRef) return;
      const order = await repository.get(orderRef);
      // Idempotent: a redelivered webhook event that already transitioned this
      // order is a no-op, not a re-publish.
      if (!order || order.status !== "pending_payment") return;
      // An address the payment page collected (and validated) wins over the one the store was given.
      const paid: Order = { ...order, status: "paid", shippingInfo: withCollectedAddress(order.shippingInfo, payment) };
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

      const allowedCountries = input.collectAddress ? (input.collectAddress.allowedCountries ?? (input.shippingInfo.countryCode ? [input.shippingInfo.countryCode] : [])) : [];
      if (input.collectAddress && allowedCountries.length === 0) throw new NoShippingCountryError();

      const closed = await notOnSale(shopperCart.items.map((item) => item.skuId));
      if (closed.length > 0) throw new ItemsNotOnSaleError(closed);

      const needQuote = shopperCart.items.filter((item) => item.customization?.quoteRequired).map((item) => item.skuId);
      if (needQuote.length > 0) throw new QuoteRequiredError(needQuote);

      const adjustment = await computeAdjustment(shopperCart.items, input.couponCode);
      // By position, not SKU: two lines of one SKU can have different customized prices.
      const unitAmountOf = (index: number, skuId: string, fallback: Money): Money => {
        const adjusted = adjustment.items[index];
        return adjusted?.skuId === skuId ? adjusted.unitAmount : fallback;
      };

      const lineItems = shopperCart.items.map((item, index) => ({ skuId: item.skuId, quantity: item.quantity, unitAmount: unitAmountOf(index, item.skuId, item.priceSnapshot) }));
      const shippingCharge = shipping ? await shipping.quote({ items: lineItems, shippingInfo: input.shippingInfo }) : null;

      const orderId = randomUUID();
      const order: Order = {
        id: orderId,
        cartId: input.cartId,
        idempotencyKey: input.idempotencyKey,
        items: shopperCart.items.map((item, index) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          priceAtPurchase: unitAmountOf(index, item.skuId, item.priceSnapshot),
          // Additive passthrough (see OrderLineItem's doc comment) -- pricing
          // is keyed by skuId only and doesn't carry customizationNote, so
          // it's read straight off the cart line here, not off `adjustment`.
          ...(item.customizationNote ? { customizationNote: item.customizationNote } : {}),
          ...(item.customization ? { customization: item.customization } : {}),
        })),
        status: "pending_payment",
        shippingInfo: input.shippingInfo,
        paymentSessionId: null,
        paymentRedirectUrl: null,
        customerId: input.customerId ?? null,
        discountTotal: adjustment.discountTotal,
        appliedPromotionCode: adjustment.appliedCode,
        ...(shippingCharge ? { shippingTotal: shippingCharge.amount } : {}),
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
        lineItems: await Promise.all(
          lineItems.map(async (item) => ({
            name: (nameLineItem ? await nameLineItem(item.skuId) : null) ?? `SKU ${item.skuId}`,
            unitAmount: item.unitAmount,
            quantity: item.quantity,
          })),
        ),
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        ...(shippingCharge ? { shipping: shippingCharge } : {}),
        ...(input.collectAddress ? { collectShippingAddress: { allowedCountries, ...(input.collectAddress.phone ? { phone: true } : {}) } } : {}),
        ...(input.shippingInfo.email?.trim() ? { customerEmail: input.shippingInfo.email.trim() } : {}),
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
