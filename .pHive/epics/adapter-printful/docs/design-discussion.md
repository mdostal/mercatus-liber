# Design Discussion: adapter-printful

## 0. Context

Backlog epic 42, depends on epic 41 (fulfillment-routing, done -- `FulfillmentAdapter` contract
now exists and is real). Grounded in the same real, API-verified research this whole
fulfillment thread comes from
(`.pHive/planning/backlog-addendum-merch-fulfillment-2026-09-09.md`), which already
established the concrete Printful API shape: two live APIs (v1 mature, v2 open beta -- v2 does
NOT yet support product/variant sync, so v1 stays needed for catalog/mockup setup), draft-then-
confirm order flow (`POST /v2/orders` creates an uncharged draft, `POST /v2/orders/{id}/confirm`
charges and moves to production), prepaid Wallet billing (Printful charges the merchant, not
the shopper directly), 120 req/min rate limit, and a real cost anchor (an 11oz mug base ~$5.95).

**Real credential gate, same disclosed pattern as epic 27 (admin-auth-clerk) and epic 46
(GA4)**: this adapter needs a real Printful account + API token to call live. Confirmed no such
credential exists in this environment. Build for real correctness against Printful's actual,
current API documentation, with real unit tests against realistically-shaped mocked responses;
disclose the live-call gap honestly, don't fake it.

## 1. Design questions

**(a) External-order-id mapping -- how does this adapter tell Printful "this is order X from my
store"?**
Resolved during this story's own research (the addendum flagged this as unverified, to confirm
during planning, not guessed here): research Printful's real v1/v2 order-creation request shape
for a merchant-reference field (Printful's API has historically supported an `external_id` field
on order creation for exactly this purpose -- confirm this is still current before relying on
it; if it's genuinely absent, fall back to `adapter-shopify`'s reserved-metafield-equivalent
approach only as a last resort, per the addendum's own fallback guidance).

**(b) v1 vs v2 -- which does this adapter actually call?**
Resolved per the addendum's own finding: v1 for catalog/product/mockup setup (v2 doesn't support
this yet), v2 preferred for order submission once its exact schema is confirmed during
implementation (the addendum flagged v2's exact `POST /v2/orders` field-level schema as
unverified -- confirm for real against Printful's current docs during this story, don't assume
the addendum's shape summary is complete). If v2's order endpoint proves genuinely unstable or
under-documented during implementation, v1's order endpoint is an acceptable, disclosed fallback
-- report which was actually used and why.

**(c) Webhook handling.**
The addendum flagged v2's webhook signature/HMAC verification format as unverified. Research
this for real during implementation. If genuinely unconfirmable from public docs without a live
account to test against, implement `handleWebhookEvent` with the real, documented event-type
parsing (`order_created`/`order_updated`/`shipment_sent`/`shipment_delivered`) and disclose the
signature-verification-specifics gap honestly rather than guessing at a scheme.

## 2. Scope assessment

**Medium.** One real third-party adapter package, same shape as `adapter-shopify`/
`adapter-clerk`/`adapter-sanity`. No new subsystem (epic 41 already built the contract this
implements). Live end-to-end verification is credential-gated and disclosed, not blocking.

## 3. Stories

1. **research-and-adapter** -- confirm the real, current v1/v2 API shapes (order schema,
   external-id field, webhook format) against Printful's actual documentation, then build
   `@mercatus-liber/adapter-printful` implementing epic 41's `FulfillmentAdapter` contract, with
   real unit tests against realistically-shaped mocked API responses.
2. **wiring-and-verification-and-closeout** -- wire the adapter into `services.ts` via a real
   env-var branch (`PRINTFUL_API_TOKEN`, mirroring every other adapter's selection pattern),
   verify what's genuinely testable without a live credential (unit tests, wiring, admin
   visibility), honestly disclose the live-call gap (mirroring epic 27/46's precedent), update
   docs, close out the backlog, merge.

## 4. Risks

- **Medium** -- v2's exact order schema and webhook signature format are both explicitly
  unconfirmed until this story's own research. Mitigation: the story requires real research
  against current docs, not reuse of the addendum's own summary as if it were already verified
  down to the field level.
- **Low** -- no live credential means no live end-to-end proof. Mitigation: honest disclosure,
  same established pattern as epics 27 and 46.

## 5. Open questions

None blocking -- both real open questions from the addendum are explicitly assigned to this
story's own research step, not deferred further.
