# Design Discussion: adapter-printify

## 0. Context

Backlog epic 43, depends on epic 41 (fulfillment-routing, done). A deliberate *second*, later,
optional POD provider -- the addendum's own explicit framing: "not needed for the first wave"
(epic 42's Printful adapter is). Built now as part of this session's full backlog sweep, but
its own real complexity (below) is worth taking seriously, not just mechanically copying
epic 42's shape.

Grounded in the same real research
(`.pHive/planning/backlog-addendum-merch-fulfillment-2026-09-09.md`): Personal Access Token
(1yr expiry) or OAuth2 auth, an app-identifying `User-Agent` header required on every request,
orders via `POST /v1/shops/{shop_id}/orders.json`, **charged only when an order moves to
production** (no wallet abstraction, unlike Printful), webhooks for
created/sent-to-production/shipment-created.

**Real, disclosed credential gate**, same pattern as epic 42/27/46: no Printify account/token
exists in this environment. Build for real correctness against Printify's current API docs,
unit-test against realistic mocked responses, disclose the live-call gap honestly.

## 1. Design questions

**(a) The real complexity Printful's single-vendor model doesn't have: multi-provider
routing.**
Printify is a **marketplace** -- the same product can be fulfilled by multiple independent
print providers with different base cost/quality/ship-time, either auto-routed via "Printify
Choice" or picked per listing. Resolved: this adapter's `submitOrder` does NOT attempt to
choose a provider itself -- provider selection is Printify's own platform responsibility once
an order is placed against a specific Printify "product" (which already has a provider bound to
it in Printify's own system, set up in their dashboard, out of this adapter's scope, same as
Printful's mockup/template setup is out of adapter-printful's scope). This adapter's job is
purely the same as Printful's: submit real orders against Printify's real API, read back real
status -- it does not need to re-implement Printify's own provider-routing logic.

**(b) Shop ID -- config or discovered?**
Resolved: real Printify accounts can have multiple shops; the adapter takes a `shopId` as
required config (mirroring how a Stripe/Shopify integration takes an account/store identifier)
rather than attempting auto-discovery, which would need an extra API round-trip and a
"what if there's more than one shop" resolution this epic doesn't need to solve.

**(c) External-order-id mapping and rate limits.**
Confirm the real, current field name during implementation (same discipline as epic 42 -- don't
assume from the addendum's directional summary). The addendum flagged Printify's exact rate
limits as unconfirmed (unlike Printful's clearly-documented 120/min) -- confirm for real or
disclose if genuinely unconfirmable.

## 2. Scope assessment

**Medium.** Same shape as epic 42 (one real third-party FulfillmentAdapter implementation), with
one additional real design consideration (marketplace routing, resolved above as out-of-scope
for this adapter itself). Credential-gated, disclosed.

## 3. Stories

1. **research-and-adapter** -- confirm real, current API details (external-id field, rate
   limits, order-creation schema, User-Agent requirement specifics) against Printify's actual
   docs, build `@mercatus-liber/adapter-printify` implementing epic 41's `FulfillmentAdapter`.
2. **wiring-verification-closeout** -- env-var wiring (`PRINTIFY_API_TOKEN` +
   `PRINTIFY_SHOP_ID`), honest credential-gap disclosure, docs, closeout, merge.

## 4. Risks

- **Low.** Same credential-gate pattern already proven twice this session (epics 27, 46) and
  once already for this exact fulfillment thread (epic 42).

## 5. Open questions

None blocking.
