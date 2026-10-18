/**
 * Real, current PayPal REST API shapes this adapter depends on, researched
 * live against developer.paypal.com on 2026-10-18 (story paypal-01, epic
 * second-payment-processor-adapter) -- not recalled from training data. Every
 * field named below was independently confirmed via a live fetch of PayPal's
 * own docs during this story; see docs/design-discussion.md's "Research
 * record" section for the full citation list (exact URLs fetched and what
 * each one confirmed).
 *
 * Confirmed findings used throughout this package:
 *
 * 1. **OAuth2 client-credentials token exchange** (developer.paypal.com/api/rest/authentication/):
 *    `POST /v1/oauth2/token` against `api-m.sandbox.paypal.com` (sandbox) or
 *    `api-m.paypal.com` (live), HTTP Basic auth with `client_id`:`client_secret`,
 *    body `grant_type=client_credentials` (form-encoded, not JSON -- confirmed
 *    by the docs' own curl example). Response carries `access_token`,
 *    `token_type` ("Bearer"), and `expires_in` (seconds); the access token is
 *    sent on every subsequent call as `Authorization: Bearer <access_token>`.
 *
 * 2. **Orders v2 create/capture/get** (developer.paypal.com/docs/api/orders/v2/
 *    and developer.paypal.com/docs/api/orders/v2/#orders_create):
 *    `POST /v2/checkout/orders` creates an order. Confirmed real example
 *    response: `{ "id": "5O190127TN364715T", "status": "CREATED", "links":
 *    [{ "rel": "approve", "href": "https://www.sandbox.paypal.com/checkoutnow?
 *    token=5O190127TN364715T" }, { "rel": "self", "href": "https://api-m.
 *    sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T" }] }` --
 *    PayPal's own canonical sample order id, reused verbatim across their own
 *    docs. The buyer approves at the `"approve"`-rel link's `href` (PayPal's
 *    hosted checkout page), the same "redirect to the provider's own hosted
 *    checkout UI" shape `PaymentAdapter.createPaymentSession` documents for
 *    every implementation (packages/payments/src/types.ts).
 *    `POST /v2/checkout/orders/{id}/capture` captures payment once the order
 *    is `APPROVED`; confirmed real response: `{ "id": "...", "status":
 *    "COMPLETED", "purchase_units": [...] }`.
 *    `GET /v2/checkout/orders/{id}` reads the order's current state. Order
 *    status progresses `CREATED` -> `APPROVED` -> `COMPLETED` (or `VOIDED` if
 *    cancelled) -- all four confirmed live.
 *
 * 3. **`custom_id` is the real merchant-reference field**
 *    (developer.paypal.com/api/orders/v2/definitions/purchase_unit_request):
 *    confirmed verbatim -- "The API caller-provided external ID. Used to
 *    reconcile client transactions with PayPal transactions. Appears in
 *    transaction and settlement reports but is not visible to the payer." --
 *    the direct PayPal analogue of Stripe's `metadata.orderRef`
 *    (stripe-adapter.ts). `reference_id` (also real, confirmed on the same
 *    page) identifies a purchase unit for `PATCH` purposes and is NOT a
 *    merchant-reconciliation field -- `custom_id` is the correct one to carry
 *    `CreatePaymentSessionInput.orderRef`.
 *
 * 4. **Redirect URLs live under `payment_source.paypal.experience_context`,
 *    not the older `application_context`** (developer.paypal.com/api/rest/
 *    integration/orders-api/v1-v2-migration and developer.paypal.com/api/
 *    orders/v2/definitions/experience_context_base_without_brand_shipping):
 *    confirmed -- the v1->v2 migration guide states fields that were under
 *    `application_context` "are now available in the `experience_context`
 *    object under the payment_source"; `return_url` and `cancel_url` are
 *    both confirmed required, `string<url>` fields on that definition.
 *    `application_context.return_url`/`cancel_url` still work (PayPal has not
 *    removed it), but `experience_context` is the current, documented-forward
 *    field -- this adapter uses `experience_context`.
 *
 * 5. **Scope deliberately narrowed: one summed purchase_unit, no itemized
 *    `items[]` breakdown.** `createPaymentSession` sums every
 *    `PaymentLineItem` into a single `purchase_units[0].amount`, the same
 *    summation shape `createSandboxPaymentAdapter` already uses
 *    (sandbox-adapter.ts's own `totalAmount` reduce). PayPal's Orders v2 does
 *    support a per-item `items[]` array with its own `amount.breakdown.
 *    item_total` requirement, but this story's research did not need to (and
 *    did not) confirm that nested breakdown schema down to the field level --
 *    sending an itemized breakdown without confirming it would be guessing,
 *    not research. A real deployment wanting itemized PayPal receipts would
 *    confirm and add that shape; this reference implementation does not
 *    invent it.
 *
 * 6. **Currency amounts are decimal strings, not minor units** -- a genuine,
 *    confirmed difference from Stripe (which takes minor-unit integers
 *    directly). `Money.amount` in this repo (@mercatus-liber/core) is always
 *    minor units (e.g. cents); `money.ts`'s `minorUnitsToPaypalValue`
 *    converts to PayPal's documented decimal-string `amount.value`.
 *    PayPal's own currency-codes reference
 *    (developer.paypal.com/reference/currency-codes) confirms exactly three
 *    zero-decimal currencies -- HUF, JPY, TWD, each described verbatim as a
 *    "Zero-digit currency — no decimal places or fractions" -- every other
 *    currency this adapter has seen documented uses 2 decimal places. This
 *    adapter only special-cases those three confirmed currencies; it does not
 *    guess at others PayPal might also treat as zero-decimal.
 *
 * 7. **Real webhook event types** (developer.paypal.com/api/rest/webhooks/event-names/):
 *    `CHECKOUT.ORDER.APPROVED` ("A buyer approved a checkout order"),
 *    `CHECKOUT.ORDER.COMPLETED` ("A checkout order is processed" -- the docs
 *    note this one is "reserved for marketplaces and platforms"),
 *    `PAYMENT.CAPTURE.COMPLETED` ("A payment capture completes"),
 *    `PAYMENT.CAPTURE.DENIED` ("A payment capture is denied"),
 *    `PAYMENT.CAPTURE.PENDING` ("The state of a payment capture changes to
 *    pending"), `PAYMENT.CAPTURE.REFUNDED` ("A merchant refunds a payment
 *    capture") -- all six quoted verbatim from PayPal's own event-names
 *    reference. This adapter only acts on `PAYMENT.CAPTURE.COMPLETED` (maps
 *    to `payments.payment.succeeded`) and `PAYMENT.CAPTURE.DENIED` (maps to
 *    `payments.payment.failed`) -- the direct capture-outcome events, mirroring
 *    how the Stripe adapter only acts on `checkout.session.completed`. The
 *    other four real event types are parsed but not acted on (same
 *    "real-but-unhandled is not an error" posture as adapter-printify's
 *    `onWebhookEvent`), see webhook.ts.
 *
 * 8. **Webhook resource field confirmed for both order- and capture-shaped
 *    resources** (developer.paypal.com/api/payments/v2/definitions/capture-2
 *    plus the Orders v2 shapes above): a Capture resource carries its own
 *    `custom_id` (same field/meaning as a purchase_unit's) and
 *    `supplementary_data.related_ids.order_id` (confirmed: "Order ID related
 *    to the resource") -- the PayPal order id that produced this capture. An
 *    Order resource (for `CHECKOUT.ORDER.*` events) carries `id` as the order
 *    id directly and `purchase_units[0].custom_id`. `webhook.ts`'s resolver
 *    reads whichever shape is present rather than assuming one.
 */

export interface PaypalOauthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PaypalLink {
  rel: string;
  href: string;
  method?: string;
}

export interface PaypalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  amount?: { currency_code: string; value: string };
}

/** Shared by both the "create order" and "get order" responses, and by the "capture" response's top level. */
export interface PaypalOrderResponse {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | string;
  links?: PaypalLink[];
  purchase_units?: PaypalPurchaseUnit[];
}

export interface PaypalCreateOrderRequest {
  intent: "CAPTURE";
  purchase_units: [
    {
      custom_id?: string;
      amount: { currency_code: string; value: string };
    },
  ];
  payment_source: {
    paypal: {
      experience_context: {
        return_url: string;
        cancel_url: string;
      };
    };
  };
}

/** The confirmed real request body for `POST /v1/notifications/verify-webhook-signature`. */
export interface PaypalVerifyWebhookSignatureRequest {
  transmission_id: string;
  transmission_time: string;
  cert_url: string;
  auth_algo: string;
  transmission_sig: string;
  webhook_id: string;
  webhook_event: unknown;
}

export interface PaypalVerifyWebhookSignatureResponse {
  verification_status: "SUCCESS" | "FAILURE" | string;
}

/** The six real, documented webhook event_type strings this adapter recognizes (research finding 7 above). Any other real event type is still parsed, just surfaced as `"other"` -- see webhook.ts. */
export const PAYPAL_WEBHOOK_EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "CHECKOUT.ORDER.COMPLETED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.REFUNDED",
] as const;

export type PaypalWebhookEventType = (typeof PAYPAL_WEBHOOK_EVENT_TYPES)[number];

/** A capture- or order-shaped webhook `resource` -- see research finding 8 above for why this adapter reads both shapes rather than assuming one. */
export interface PaypalWebhookResource {
  id?: string;
  custom_id?: string;
  status?: string;
  purchase_units?: PaypalPurchaseUnit[];
  supplementary_data?: { related_ids?: { order_id?: string } };
}

export interface PaypalWebhookPayload {
  id: string;
  event_type: string;
  resource: PaypalWebhookResource;
}
