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

## Key exports

- `PaymentAdapter`: `createPaymentSession`, `confirmPayment`, `handleWebhookEvent`.
- `createStripeAdapter({ secretKey, webhookSecret, events })`.
- `createSandboxPaymentAdapter({ events, checkoutPagePath })`, with `confirmSandboxPayment` to complete a sandbox payment.
- `WebhookVerificationError`.

## Implementing an adapter

Implement `PaymentAdapter`. `handleWebhookEvent` must verify the provider's signature before trusting the payload. `packages/adapter-paypal` is another example.

See [docs/subsystems/08-payments.md](../../docs/subsystems/08-payments.md).
