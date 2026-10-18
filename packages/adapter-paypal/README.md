# @mercatus-liber/adapter-paypal

A real, second `PaymentAdapter` implementation (subsystem 08, `@mercatus-liber/payments`) backed by
PayPal's real, documented **Orders v2** API. Stripe (`@mercatus-liber/payments`'s own
`createStripeAdapter`) was the only real implementation of `PaymentAdapter` before this package --
this one proves the interface is genuinely provider-agnostic, the same way
`@mercatus-liber/adapter-postgres` proved persistence is swappable. Recorded as a new-epic
candidate at `.pHive/planning/epic-backlog.md` row 77
(`integrations-catalog-and-ecosystem-audit`), built under epic
`.pHive/epics/second-payment-processor-adapter/`.

## What this adapter does

- **`createPaymentSession`** -- `POST /v2/checkout/orders` (`intent: "CAPTURE"`), returning the
  real `"approve"`-rel link's `href` as `redirectUrl`. The shopper is redirected to PayPal's own
  hosted approval page, same "never touch card data, redirect to the provider's hosted checkout
  UI" contract every `PaymentAdapter` implementation follows.
- **`confirmPayment`** -- resolves PayPal's real create-then-capture flow onto the shared
  3-method `PaymentAdapter` contract: `GET /v2/checkout/orders/{id}`, and if the shopper has
  already approved (`status === "APPROVED"`), additionally calls `POST .../capture` right there
  before reporting `"paid"`. (Stripe Checkout auto-captures on Stripe's own side; PayPal's Orders
  v2 flow splits approval and capture into two real steps, so this adapter performs the second
  step itself.)
- **`handleWebhookEvent`** -- verifies via PayPal's own real `POST
  /v1/notifications/verify-webhook-signature` endpoint, then publishes
  `payments.payment.succeeded` on `PAYMENT.CAPTURE.COMPLETED` and `payments.payment.failed` on
  `PAYMENT.CAPTURE.DENIED`.

## Real, documented API surface this adapter calls

Every endpoint and field below was independently confirmed by live-fetching PayPal's own current
docs on 2026-10-18 (not recalled from training data) -- see `src/paypal-types.ts`'s top doc
comment for the full citation list (exact URLs and what each confirmed):

| Call | Endpoint | Source |
| --- | --- | --- |
| OAuth2 token | `POST /v1/oauth2/token` (HTTP Basic, `grant_type=client_credentials`) | developer.paypal.com/api/rest/authentication/ |
| Create order | `POST /v2/checkout/orders` | developer.paypal.com/docs/api/orders/v2/ |
| Capture order | `POST /v2/checkout/orders/{id}/capture` | developer.paypal.com/docs/api/orders/v2/ |
| Get order | `GET /v2/checkout/orders/{id}` | developer.paypal.com/docs/api/orders/v2/ |
| Merchant reference field | `purchase_units[].custom_id` | developer.paypal.com/api/orders/v2/definitions/purchase_unit_request |
| Redirect URLs | `payment_source.paypal.experience_context.{return_url,cancel_url}` | developer.paypal.com/api/rest/integration/orders-api/v1-v2-migration |
| Webhook headers | `PAYPAL-TRANSMISSION-ID/-TIME/-CERT-URL/-AUTH-ALGO/-TRANSMISSION-SIG` | developer.paypal.com/api/rest/webhooks/rest/ |
| Webhook verification | `POST /v1/notifications/verify-webhook-signature` | developer.paypal.com/docs/api/webhooks/v1/ |
| Webhook event types | `CHECKOUT.ORDER.APPROVED/COMPLETED`, `PAYMENT.CAPTURE.COMPLETED/DENIED/PENDING/REFUNDED` | developer.paypal.com/api/rest/webhooks/event-names/ |
| Zero-decimal currencies | exactly `HUF`, `JPY`, `TWD` | developer.paypal.com/reference/currency-codes |

PayPal documents **two** real webhook-signature-verification schemes: a local CRC32+RSA
self-verification, and the remote `verify-webhook-signature` API call this adapter uses. Both are
real and documented; this adapter uses the remote call because it is the one a credential-gated
adapter tested only against a fake HTTP server can genuinely exercise end-to-end (it is itself
just another authenticated call through this adapter's own HTTP client). See `src/webhook.ts`'s
doc comment for the full reasoning.

## A disclosed interface bridge

`PaymentAdapter.handleWebhookEvent(rawBody, signature)`'s `signature: string` parameter is
shaped for Stripe's single-header webhook model. PayPal's real scheme needs **five** distinct
transmission headers, not one string -- a genuine mismatch, not something this adapter guesses
around. No change to the shared `PaymentAdapter` interface was in scope for this epic, so the
host application bridges the gap by building `signature` as:

```ts
JSON.stringify({
  transmissionId: req.headers["paypal-transmission-id"],
  transmissionTime: req.headers["paypal-transmission-time"],
  certUrl: req.headers["paypal-cert-url"],
  authAlgo: req.headers["paypal-auth-algo"],
  transmissionSig: req.headers["paypal-transmission-sig"],
})
```

before calling `handleWebhookEvent(rawBody, signature)`. See `src/webhook.ts`'s doc comment for
the full contract.

## What's tested vs. credential-gated

**No real PayPal developer account/app exists anywhere in this repo or environment.** This
adapter is real, built, and unit-tested against a fake HTTP server shaped exactly like PayPal's
real, documented request/response bodies above (`test/http-client.test.ts`,
`test/adapter.test.ts`) -- it is **not live-verified against a real PayPal account**. This is the
identical disclosed posture as every other credential-gated third-party adapter in this repo
(`@mercatus-liber/adapter-printful`, `@mercatus-liber/adapter-printify`,
`@mercatus-liber/adapter-shippo`): correct against the provider's real, current API shape, not
exercised against the live API.

A real deployment wiring this up for real traffic would need:

1. A real PayPal REST API app (developer.paypal.com) -- `clientId`/`clientSecret`.
2. A real webhook subscription registered for this listener URL -- its `webhookId`, for
   `handleWebhookEvent`'s default remote verifier (omit it and supply `verifyWebhookSignature`
   instead to use a different scheme, e.g. the local CRC32+RSA one this adapter doesn't
   implement).
3. `baseUrl: "https://api-m.paypal.com"` to go live (defaults to PayPal's sandbox base).

## Scope deliberately narrowed

- **One summed `purchase_unit`, no itemized `items[]` breakdown.** `createPaymentSession` sums
  every `PaymentLineItem` into a single `purchase_units[0].amount` (the same summation shape
  `createSandboxPaymentAdapter` already uses). PayPal's Orders v2 does support an itemized
  `items[]` array with its own `amount.breakdown.item_total` requirement, but this adapter's
  research didn't need to (and didn't) confirm that nested breakdown schema -- sending it without
  confirming it would be guessing, not research.
- **`PaymentConfirmation.status` is only ever `"paid"`/`"unpaid"`**, never
  `"no_payment_required"` -- that third state is specific to Stripe Checkout Sessions and has no
  PayPal Orders v2 analogue this adapter's research found.

## Wiring

`apps/reference-storefront/lib/services.ts` selects a payment provider via priority chain: real
Stripe (`STRIPE_SECRET_KEY`) > real PayPal (`PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`) > the
sandbox adapter. Optional `PAYPAL_WEBHOOK_ID` and `PAYPAL_BASE_URL` configure webhook verification
and the live/sandbox base respectively. See that file's own doc comment on the `payments` branch
for the full reasoning, and `apps/reference-storefront/lib/adapter-info.ts`'s `paymentsInfo()` for
how the active provider is surfaced to the admin UI.
