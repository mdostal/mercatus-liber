# Commerce Core: Catalog, Cart, Checkout, and Payments

This is the base loop every storefront built on Mercatus Liber has to get right before
anything else matters: a shopper browses products, adds SKUs to a cart, checks out, and pays.
Four subsystems make that loop work — [catalog](/subsystems/01-catalog),
[cart](/subsystems/07-cart), [checkout & orders](/subsystems/09-checkout-orders), and
[payments](/subsystems/08-payments) — and each one is deliberately narrow, talking to its
neighbors through typed interfaces and events rather than reaching into each other's internals.

## Products and SKUs: what exists vs. what a shopper actually buys

The catalog subsystem draws a line that a lot of commerce platforms blur: a **Product** is the
sellable idea ("Embroidered Canvas Tote"), and a **SKU** is one concrete, purchasable
combination of that product's *identifying* attributes (color, size — the attributes that fork
into a distinct SKU) as opposed to its merely *descriptive* attributes (material, care
instructions — full attribute-map data that doesn't fork anything). A product declares which
attribute keys are identifying; the catalog service can then generate the full cartesian
product of SKUs for you, or resolve a shopper's variant picker selection straight back to the
one SKU it corresponds to:

```ts
// packages/catalog/src/service.ts
export interface CatalogService {
  createProduct(input: NewProductInput): Promise<Product>;
  /** draft -> active. See docs/subsystems/01-catalog.md open question 1 -- no separate "active but hidden" state yet. */
  publishProduct(id: string): Promise<Product>;
  archiveProduct(id: string): Promise<void>;

  createSku(input: NewSkuInput): Promise<Sku>;
  generateSkus(
    productId: string,
    valuesByKey: Record<string, AttributeValue[]>,
    price: Money,
    exclude?: IdentifyingAttribute[][],
  ): Promise<Sku[]>;
  resolveVariant(productId: string, selection: IdentifyingAttribute[]): Promise<Sku | null>;
}
```

`generateSkus` takes every possible value for every identifying attribute key, builds the
cartesian product, and lets you exclude combinations that don't actually exist for this product
(no size-14 in the discontinued colorway, say). `resolveVariant` is what a PDP's variant picker
calls once a shopper has clicked through color and size — it's a read, not a re-derivation, so
the picker UI never has to reimplement the matching logic itself.

Every mutation publishes an event (`catalog.product.created`, `catalog.sku.created`, and so on)
instead of calling into search or inventory directly — catalog has no idea those subsystems
exist. That's not incidental decoupling; it's how a low-SKU shop and a search-indexed
10,000-SKU shop can both run on the exact same catalog package.

## Cart: the reason this project exists

The cart subsystem's own doc is blunt about its origin: Stripe Payment Links — a fine tool for
a single-product checkout link — can't hold a real, long-lived, multi-item cart. That gap is
what justified building a commerce framework at all instead of just wiring up hosted payment
links. A cart here is genuinely long-lived: it persists across a session for a guest and across
devices for a signed-in shopper, and every line item snapshots its price at add-time rather than
trusting a live catalog lookup at checkout:

```ts
// packages/cart/src/service.ts
async addItem(cartId, skuId, quantity, customizationNote) {
  if (quantity <= 0) {
    throw new RangeError(`quantity must be > 0, got ${quantity}`);
  }
  const cart = await requireCart(cartId);
  const sku = await skus.getSku(skuId);
  if (!sku || sku.status !== "active") {
    throw new SkuNotAvailableError(skuId);
  }

  const note = customizationNote?.trim() || undefined;
  const existing = cart.items.find((item) => item.skuId === skuId && item.customizationNote === note);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ skuId, quantity, priceSnapshot: sku.price, ...(note ? { customizationNote: note } : {}) });
  }
  await repository.save(cart);
  await events.publish("cart.item.added", { cartId, skuId, quantity });
  return cart;
}
```

Two things worth noticing in that snippet. First, two lines of the *same* SKU with *different*
personalization text (`customizationNote`) stay separate lines rather than silently merging —
useful the moment a shop sells anything monogrammed or engraved. Second, cart never imports
checkout or payments at all; it only knows how to hold and mutate line items. Checkout is the
one that reaches into cart, not the other way around, which is what lets cart stay useful in
contexts that never reach a payment page — a "save for later" list, or a future B2B
quote-request flow.

## Checkout: turning a cart into an order, idempotently

`checkout-orders` is the busiest subsystem in the whole framework in terms of cross-subsystem
interaction, and its own doc calls that out as the best real test of the decoupling rule. It
reads cart (read-only), calls the payments interface to create a session, and reacts to
`payments.payment.succeeded` — an event, not a direct callback — to flip an order from
`pending_payment` to `paid`:

```ts
// packages/checkout-orders/src/service.ts
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
  // ... order created as "pending_payment", then:
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

  return { order: withSession, redirectUrl: session.redirectUrl };
}
```

That `idempotencyKey` check matters more than it might look: a shopper who double-clicks
"place order," or whose network hiccups and retries the same request, gets back the *same*
order and the *same* payment redirect instead of a second charge. The `PricingAdjuster`
dependency is optional — if a deployment hasn't adopted the promotions subsystem, checkout
falls back to a pass-through calculation that's byte-identical to pre-promotions behavior, so
adding promotions later is additive, never a breaking change to checkout itself.

When a payment actually succeeds, checkout doesn't find out by polling or by a direct function
call from the payments package — it subscribes to an event:

```ts
// packages/checkout-orders/src/service.ts
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
```

An order placement fans out from there to inventory (decrement stock), account (order shows up
in a shopper's dashboard), and potentially a plugin — none of which `checkout-orders` needs to
import or know about. Adding a new reaction to "order placed" later is a new subscriber
somewhere else in the system, never a change to this file.

## Payments: an adapter, not a payment processor

The payments subsystem is deliberately the thinnest layer in commerce core. It never touches
card data, never computes tax, and never decides *when* to charge — it exposes one interface,
`PaymentAdapter`, and Stripe is the first (and so far only) concrete implementation of it:

```ts
// packages/payments/src/types.ts
export interface PaymentAdapter {
  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  confirmPayment(sessionId: string): Promise<PaymentConfirmation>;
  /**
   * Verifies and processes a provider webhook payload. Implementations MUST
   * verify the signature before trusting the payload (never trust an
   * unverified webhook body). Publishes payments.payment.succeeded /
   * payments.payment.failed on the injected EventBus -- callers don't need to
   * inspect the raw provider event shape.
   */
  handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void>;
}
```

The reference Stripe adapter wraps Stripe Checkout Sessions — hosted checkout UI, automatic
Stripe Tax, and webhook-driven confirmation — so this framework never hand-builds payment
forms, PCI handling, or tax logic itself:

```ts
// packages/payments/src/stripe-adapter.ts
async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: input.lineItems.map((item) => ({
      price_data: {
        currency: item.unitAmount.currency.toLowerCase(),
        product_data: { name: item.name },
        unit_amount: item.unitAmount.amount,
      },
      quantity: item.quantity,
    })),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    automatic_tax: { enabled: true },
    metadata: { orderRef: input.orderRef },
  });

  if (!session.url) {
    throw new Error(`Stripe did not return a redirect URL for session ${session.id}`);
  }

  return { sessionId: session.id, redirectUrl: session.url };
}
```

Notice `metadata: { orderRef: input.orderRef }` — that's the thread that lets a Stripe webhook,
arriving asynchronously and with no other context, tell checkout-orders exactly which order to
mark paid. And because `PaymentAdapter` is a real interface rather than a Stripe-shaped
assumption baked into checkout, a second provider — PayPal, a regional processor, whatever "or
other things manually" ends up meaning per the framework's own founding spec — is a new package
implementing the same three methods, with zero changes to checkout-orders or anything else that
depends on it.

## Further reading

- [Subsystem 01 — Product Catalog](/subsystems/01-catalog)
- [Subsystem 07 — Cart](/subsystems/07-cart)
- [Subsystem 08 — Payments](/subsystems/08-payments)
- [Subsystem 09 — Checkout & Orders](/subsystems/09-checkout-orders)
