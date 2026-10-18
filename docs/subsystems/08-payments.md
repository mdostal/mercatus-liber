# Subsystem 08 — Payments

## Purpose
A payment adapter interface, with **Stripe as the first (and initially only) concrete
implementation**, per the founder's spec: "a payment adapter that we will just link to stripe
for now but could link into other things manually." This subsystem is deliberately thin — it
never touches card data, PCI scope, or tax calculation directly; it delegates all of that to
whatever the concrete adapter's underlying provider handles (Stripe Checkout Sessions + Stripe
Tax for the reference adapter), carrying forward the hard rule from `shop.mdostal.com`'s own
planning: never hand-build payments/tax/shipping.

## Depends on
`@core/schema` only (for `Money` and order-reference types). No dependency on cart, catalog, or
CMS — payments only needs to know "charge this amount, for this order reference, redirect/
confirm here."

## Responsibilities
- `PaymentAdapter` interface: `createPaymentSession(orderRef, lineItems, amount) -> {redirectUrl | clientSecret}`,
  `confirmPayment(sessionId) -> PaymentResult`, webhook/event handling contract for
  provider-pushed status updates (e.g. Stripe webhooks).
- The Stripe reference adapter: wraps Stripe Checkout Sessions (server-side session creation,
  hosted checkout UI, Stripe Tax) — the same mechanism validated in the `shop.mdostal.com` CBA
  as the correct way to get a real cart without hand-building payment/tax/PCI.
- Publishes `payments.payment.succeeded|failed|refunded` events for checkout-orders (09) to
  react to — payments doesn't know what an "order" does with that information.

## Explicitly NOT this subsystem's job
- Deciding when to charge (checkout-orders, 09, orchestrates the checkout flow and calls into
  this subsystem at the right point).
- Any payment logic beyond delegating to the adapter — no custom card handling, no stored
  card-number logic anywhere in this subsystem or its adapters, ever.

## Decoupling notes
A second payment adapter (PayPal, a regional processor, whatever "other things manually" ends
up meaning) is a new package implementing `PaymentAdapter` — zero changes to checkout-orders
(09) or any other subsystem. This is the cleanest adapter boundary in the whole system because
payments has the fewest other concerns bleeding into it.

**This is no longer hypothetical.** `@mercatus-liber/adapter-paypal`
(`second-payment-processor-adapter` epic) is a real, built, unit-tested second implementation —
PayPal's Orders v2 API (`POST /v2/checkout/orders` to create, `POST .../capture` to capture,
`GET /v2/checkout/orders/{id}` to read status), plus real webhook verification via PayPal's own
`POST /v1/notifications/verify-webhook-signature` endpoint. Zero changes were needed to
checkout-orders, cart, or `PaymentAdapter` itself — exactly the decoupling this section
predicted. See `packages/adapter-paypal/README.md` for the full research citation record and the
**honest credential-gap disclosure**: no real PayPal developer account/app exists in this
environment, so this adapter is correctness-verified against a fake HTTP server shaped like
PayPal's real, documented API, not live-verified against a real PayPal account — the identical
disclosed posture as `@mercatus-liber/adapter-printful`/`adapter-printify`/`adapter-shippo`.

Wired into `apps/reference-storefront/lib/services.ts` as a priority chain: real Stripe
(`STRIPE_SECRET_KEY`) > real PayPal (`PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`) > the sandbox
adapter (unchanged default when neither is configured). One genuine, disclosed interface
impedance mismatch surfaced building this: `PaymentAdapter.handleWebhookEvent`'s
`signature: string` parameter is shaped for Stripe's single-header webhook model, but PayPal's
real scheme needs five distinct transmission headers. Rather than changing the shared interface
(out of scope for this epic), the host application bridges the gap by JSON-encoding the five real
`PAYPAL-*` headers into that one `signature` string before calling `handleWebhookEvent` — see
`packages/adapter-paypal/src/webhook.ts`'s doc comment for the full contract.

## Open questions
1. Multi-provider checkout (let the shopper pick Stripe vs. something else at checkout time) —
   v1 scope or a documented future extension? Recommend: documented future extension; v1 is
   Stripe-only per the shop's own decided platform ladder.
2. Refund/partial-refund — part of this interface from day one, or added when checkout-orders
   (09) actually needs it?
3. Webhook signature verification / idempotency — adapter-specific detail, but the interface
   contract should require adapters to guarantee idempotent event handling regardless of
   provider.
