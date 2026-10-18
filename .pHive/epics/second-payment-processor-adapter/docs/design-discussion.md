# Design Discussion: second-payment-processor-adapter

## 0. Context

Recorded as a new-epic candidate at `.pHive/planning/epic-backlog.md` row 77
(`integrations-catalog-and-ecosystem-audit`, ica-02's ecosystem-gap audit, 2026-10-07):
`PaymentAdapter` (`packages/payments/src/types.ts`) has exactly one real implementation,
Stripe (`packages/payments/src/stripe-adapter.ts`) -- every demo's checkout is 100%
Stripe-or-sandbox (`packages/payments/src/sandbox-adapter.ts`). The audit named PayPal Orders v2
as the natural second implementation, explicitly noting **no new interface design is needed** --
this epic implements the existing contract a second, independent way, the same shape as
`@mercatus-liber/adapter-postgres` proved persistence is genuinely swappable and
`@mercatus-liber/adapter-printify` proved fulfillment is.

**Real credential gate, same disclosed pattern as `adapter-printful`/`adapter-printify`/
`adapter-shippo`**: this adapter needs a real PayPal developer account/app to call live.
Confirmed no such credential exists in this environment (checked `.env.local` and `process.env`
at implementation time: no `PAYPAL_*` variable is set anywhere). Build for real correctness
against PayPal's actual, current, live-researched API documentation, with real unit tests
against a fake HTTP server shaped exactly like PayPal's real responses; disclose the live-call
gap honestly, don't fake it.

## 1. Research record

Everything below was confirmed by **live-fetching** developer.paypal.com on 2026-10-18 during
this epic's own research pass -- not recalled from training data. Full citations:

1. **OAuth2 client-credentials token exchange**
   (developer.paypal.com/api/rest/authentication/): `POST /v1/oauth2/token` against
   `api-m.sandbox.paypal.com` (sandbox) / `api-m.paypal.com` (live), HTTP Basic auth with
   `client_id`:`client_secret`, body `grant_type=client_credentials` (form-encoded). Response:
   `access_token`, `token_type` ("Bearer"), `expires_in` (seconds).

2. **Orders v2 create/capture/get**
   (developer.paypal.com/docs/api/orders/v2/ and .../#orders_create): `POST
   /v2/checkout/orders` creates an order. Confirmed real example response (PayPal's own canonical
   sample order id, reused verbatim across their docs):
   ```json
   {
     "id": "5O190127TN364715T",
     "status": "CREATED",
     "links": [
       { "rel": "approve", "href": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" },
       { "rel": "self", "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T" }
     ]
   }
   ```
   `POST /v2/checkout/orders/{id}/capture` captures an `APPROVED` order, response `status:
   "COMPLETED"`. `GET /v2/checkout/orders/{id}` reads current state. Order status progresses
   `CREATED` -> `APPROVED` -> `COMPLETED` (or `VOIDED`) -- all four confirmed live.

3. **`custom_id` is the real merchant-reference field**
   (developer.paypal.com/api/orders/v2/definitions/purchase_unit_request), quoted verbatim:
   "The API caller-provided external ID. Used to reconcile client transactions with PayPal
   transactions. Appears in transaction and settlement reports but is not visible to the payer."
   -- the direct PayPal analogue of Stripe's `metadata.orderRef`. `reference_id` (also on that
   page) is a `PATCH`-targeting identifier, NOT a merchant-reconciliation field -- confirmed
   `custom_id` is the right one, not guessed.

4. **Redirect URLs live under `payment_source.paypal.experience_context`, not the older
   `application_context`** (developer.paypal.com/api/rest/integration/orders-api/v1-v2-migration
   and .../definitions/experience_context_base_without_brand_shipping): the v1->v2 migration
   guide states fields that were under `application_context` "are now available in the
   `experience_context` object under the payment_source"; `return_url`/`cancel_url` are both
   confirmed required, `string<url>` fields.

5. **Exactly three zero-decimal currencies** (developer.paypal.com/reference/currency-codes):
   `HUF`, `JPY`, `TWD`, each described verbatim as a "Zero-digit currency — no decimal places or
   fractions." Every other currency confirmed documented uses 2 decimal places. This repo's
   `Money.amount` (`@mercatus-liber/core`) is always minor units (cents) -- a genuine,
   confirmed representational difference from Stripe (which takes minor units directly);
   `packages/adapter-paypal/src/money.ts` converts.

6. **Real webhook event types** (developer.paypal.com/api/rest/webhooks/event-names/), quoted
   verbatim: `CHECKOUT.ORDER.APPROVED` ("A buyer approved a checkout order"),
   `CHECKOUT.ORDER.COMPLETED` ("A checkout order is processed" -- "reserved for marketplaces and
   platforms"), `PAYMENT.CAPTURE.COMPLETED` ("A payment capture completes"),
   `PAYMENT.CAPTURE.DENIED` ("A payment capture is denied"), `PAYMENT.CAPTURE.PENDING` ("The
   state of a payment capture changes to pending"), `PAYMENT.CAPTURE.REFUNDED` ("A merchant
   refunds a payment capture").

7. **Webhook signature verification -- two real, documented schemes**
   (developer.paypal.com/api/rest/webhooks/ and its linked `/api/rest/webhooks/rest/`
   integration guide): (a) **local self-verification** -- form
   `transmissionId|timeStamp|webhookId|crc32` (CRC32 of the raw body, decimal form), verify
   against `PAYPAL-TRANSMISSION-SIG` using the public key in the x509 cert at `PAYPAL-CERT-URL`
   (`PAYPAL-AUTH-ALGO` confirmed `"SHA256withRSA"` in PayPal's own examples); (b) **remote
   verification** -- `POST /v1/notifications/verify-webhook-signature` with
   `{ transmission_id, transmission_time, cert_url, auth_algo, transmission_sig, webhook_id,
   webhook_event }`, response `{ verification_status: "SUCCESS" | "FAILURE" }`
   (developer.paypal.com/docs/api/webhooks/v1/). Headers confirmed:
   `paypal-transmission-id`/`-transmission-time`/`-cert-url`/`-transmission-sig`/`-auth-algo`.

8. **Capture resource's own `custom_id` + order-id linkage**
   (developer.paypal.com/api/payments/v2/definitions/capture-2): a Capture resource carries its
   own `custom_id` (same field/meaning as a purchase_unit's) and
   `supplementary_data.related_ids.order_id` ("Order ID related to the resource") -- the PayPal
   order id that produced this capture.

## 2. Design decisions

**(a) Why the remote `verify-webhook-signature` call, not the local CRC32+RSA scheme?**
Both are real and documented (finding 7). The remote call is the one a credential-gated adapter
tested only against a fake HTTP server can genuinely exercise end-to-end: it is itself just
another authenticated call through this adapter's own injectable HTTP client, so the test suite
asserts on the exact request PayPal's docs specify and controls the exact response, the same way
every other PayPal call in this package is tested. The local scheme would require fetching and
parsing a real x509 certificate and implementing CRC32 + RSA-SHA256 verification with no API
call to fake against -- real additional work this epic's scope didn't need, since PayPal's own
docs present the remote call as a first-class, equally valid alternative, not a fallback for
people who can't do the local scheme properly.

**(b) The `handleWebhookEvent(rawBody, signature)` interface bridge.**
`PaymentAdapter`'s existing `signature: string` parameter is shaped for Stripe's single-header
webhook model (`Stripe-Signature`). PayPal's real scheme needs five distinct pieces of
transmission metadata (finding 7), not one string -- a genuine mismatch. Per this epic's own
scope (the backlog candidate explicitly said no interface change is needed), the adapter does
not change `PaymentAdapter` itself; instead the host application is documented to build
`signature` as `JSON.stringify({ transmissionId, transmissionTime, certUrl, authAlgo,
transmissionSig })` from the five real headers before calling `handleWebhookEvent`. Disclosed in
`packages/adapter-paypal/src/webhook.ts`'s doc comment, the package README, and
`docs/subsystems/08-payments.md` -- not silently worked around.

**(c) Resolving create-then-capture onto `confirmPayment`.**
`PaymentAdapter` has exactly 3 methods, no separate "capture" step. Stripe Checkout Sessions
auto-capture on Stripe's own side at checkout completion; PayPal's Orders v2 splits approval and
capture into two real API calls. `confirmPayment` performs both: `GET` the order, and if
`APPROVED`, call `capture` right there before reporting `"paid"`. This keeps the capture
semantics entirely inside the adapter -- no caller needs to know PayPal-specific capture
mechanics the shared interface doesn't expose.

**(d) Scope deliberately narrowed: one summed `purchase_unit`, no itemized `items[]`.**
`createPaymentSession` sums every `PaymentLineItem` into a single `purchase_units[0].amount` --
the same summation shape `createSandboxPaymentAdapter` already uses. PayPal's Orders v2 does
support a per-item `items[]` array with its own `amount.breakdown.item_total` requirement, but
this epic's research did not need to (and did not) confirm that nested breakdown schema --
sending it unconfirmed would be guessing, not research.

**(e) `custom_id`, not `reference_id`, carries `orderRef`.** See finding 3.

**(f) Error-class design.** `PaypalWebhookSignatureNotConfiguredError` and
`PaypalWebhookSignatureInvalidError` both extend `WebhookVerificationError`
(`packages/payments/src/types.ts`) -- the shared base class Stripe's own adapter raises for this
case -- so a caller wanting uniform "webhook signature failed" handling across whichever
provider is configured can catch `WebhookVerificationError` alone, while PayPal-specific detail
remains available via the named subclasses. `FulfillmentAdapter` (Printful/Printify) has no
equivalent shared base class, so this is specific to payment adapters.

## 3. Scope assessment

**Medium.** One real third-party adapter package, same shape as `adapter-printful`/
`adapter-printify`/`adapter-shippo`. No new subsystem and no interface change (the backlog
candidate explicitly confirmed this). Live end-to-end verification is credential-gated and
disclosed, not blocking.

## 4. Stories

1. **paypal-01-research-and-adapter** -- confirm the real, current Orders v2 + webhook API
   shapes against PayPal's actual, live documentation, then build
   `@mercatus-liber/adapter-paypal` implementing `PaymentAdapter`, with real unit tests against a
   fake HTTP server shaped like PayPal's real, documented responses.
2. **paypal-02-wiring-verification-closeout** -- wire the adapter into
   `apps/reference-storefront/lib/services.ts` via a real env-var branch (`PAYPAL_CLIENT_ID` +
   `PAYPAL_CLIENT_SECRET`, mirroring every other credential-gated adapter's selection pattern,
   zero behavior change when unconfigured), verify what's genuinely testable without a live
   credential, honestly disclose the live-call gap, update docs, close out.

## 5. Risks

- **Low** -- the Orders v2 create/capture/get shapes and the webhook event-type/verification
  schemes are all confirmed live against current docs (section 1), not guessed.
- **Low** -- no live credential means no live end-to-end proof. Mitigation: honest disclosure,
  same established pattern as `adapter-printful`/`adapter-printify`/`adapter-shippo`.
- **Low** -- the `handleWebhookEvent` signature-parameter bridge (decision b) is a real,
  disclosed design choice, not a silent interface violation; documented in three places
  (webhook.ts, README, docs/subsystems/08-payments.md) so a future maintainer can't miss it.

## 6. Open questions

None blocking -- every open question this epic's own research needed to resolve (webhook
verification mechanism, merchant-reference field, redirect-URL field location, currency decimal
handling, event-type set) was resolved during story paypal-01's own research, not deferred.
