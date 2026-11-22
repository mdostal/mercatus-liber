# @mercatus-liber/payments

The payment adapter contract, a Stripe adapter, and a sandbox adapter for running full checkouts without a provider.

**Status:** used by the demo stores, which run the sandbox adapter in production: no live Stripe key is configured, so the Stripe adapter is unverified against live Stripe. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createSandboxPaymentAdapter, createStripeAdapter } from "@mercatus-liber/payments";

const events = createInMemoryEventBus();

const payments = process.env.STRIPE_SECRET_KEY
  ? createStripeAdapter({
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      events,
    })
  : createSandboxPaymentAdapter({ events, checkoutPagePath: "/sandbox-checkout" });
```

## Collecting the shipping address on Stripe's page

Pass `collectShippingAddress: { allowedCountries: ["US"], phone: true }` (and `customerEmail`) to
`createPaymentSession`. What Stripe collected arrives on `payments.payment.succeeded` as
`customer` and `shippingAddress` (see `PaymentEvent`).

## Abandoned-checkout recovery

Off by default. Turn it on in the Stripe adapter:

```ts
createStripeAdapter({
  secretKey, webhookSecret, events,
  checkoutRecovery: { expiresAfterMinutes: 60 }, // 30 to 1440; Stripe's default is 24 hours
});
```

Each session then gets a recovery link when it expires (`after_expiration.recovery`, promotion
codes off unless `allowPromotionCodesOnRecovery`; `recoveryLink: false` turns it off).

To send reminders you need the shopper's consent. `askPromotionalConsent: true` shows Stripe's
"email me offers" checkbox where it's allowed to ask (`consent_collection.promotions: "auto"`).
**First accept Stripe's Checkout terms** at https://dashboard.stripe.com/settings/checkout (the
account owner has to): until then Stripe refuses every session that asks. If it does, the adapter
logs a warning and creates the session without the checkbox, so checkout keeps working, but no
shopper can consent and `canRemind` stays false.

Add `checkout.session.expired` to the Stripe webhook endpoint's events. The adapter publishes
`payments.payment.expired` (`PaymentExpiredEvent`: `orderRef`, `email`, `promotionalConsent`,
`recoveryUrl`, `recoveryExpiresAt`, `expiredAt`). A payment made through a recovery link carries
`recoveredFromSessionId`. The sandbox adapter's `expireSandboxSession` publishes the same event
for demos and tests.

## Key exports

- `PaymentAdapter`: `createPaymentSession`, `confirmPayment`, `handleWebhookEvent`.
- `createStripeAdapter({ secretKey, webhookSecret, events })`.
- `createSandboxPaymentAdapter({ events, checkoutPagePath })`, with `confirmSandboxPayment` to complete a sandbox payment and `expireSandboxSession` to abandon one.
- `WebhookVerificationError`.

## Implementing an adapter

Implement `PaymentAdapter`. `handleWebhookEvent` must verify the provider's signature before trusting the payload. `packages/adapter-paypal` is another example.

See [docs/subsystems/08-payments.md](../../docs/subsystems/08-payments.md).
