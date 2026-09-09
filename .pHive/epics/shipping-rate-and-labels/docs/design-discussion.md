# Design Discussion: shipping-rate-and-labels

## 0. Context

Backlog epic 44, the last piece of this session's fulfillment-and-shipping thread. User's
explicit ask: "by default i'd use pirateship but no API... for mine, i'd want full automation
and i believe shippo provides that." Distinct from epics 41-43 (which cover *who produces* an
order -- self-fulfilled, Printful, Printify): this is *how a self-fulfilled order physically
ships* -- rate shopping, label purchase, tracking. Every order, regardless of fulfillment
provider, still needs this (even a Printful/Printify order's *merchant-facing* shipping cost
question is separate from what a self-fulfilled line needs).

## 1. Design questions

**(a) New subsystem, or extend @mercatus-liber/fulfillment (epic 41)?**
Resolved: a **new, separate subsystem**, `@mercatus-liber/shipping`. Reasoning, confirmed by
re-reading epic 41's own design-discussion: fulfillment is about *who produces/ships* a line
(provider routing); shipping-rate-and-labels is about *the physical shipping transaction itself*
(rate shopping, label purchase, tracking) -- a self-fulfilled order (the majority case for
Northline's services, Broadleaf's handmade goods, and any dragon-merch-era self-3D-printed
item) still needs real shipping-rate/label handling even though it has no external fulfillment
provider at all. Conflating the two would force every shipping concern through the fulfillment
contract even when there's no external provider involved.

**(b) Zero-infra default -- what does "PirateShip, no API" actually mean for a default
adapter?**
Resolved: `createManualShippingAdapter()` -- genuinely and honestly a **documented manual
workflow**, not a stub pretending to be automated. PirateShip has no public API (confirmed
during this story's own research, not assumed): the default adapter's `getRates`/`buyLabel`
return a clear, real "use your PirateShip account directly" instruction/link rather than
fabricated data, and `getTrackingStatus` requires the operator to have entered a real tracking
number by hand elsewhere (the fulfillment subsystem's existing manual "mark shipped" flow from
epic 41 already has a trackingNumber/trackingUrl field on `FulfillmentLineRecord` -- this
adapter doesn't duplicate that, it's specifically for shipping-rate SHOPPING and label
PURCHASE, which epic 41's manual adapter never attempted).

**(c) Real adapter -- Shippo, per the user's explicit stated preference for full automation.**
`@mercatus-liber/adapter-shippo`, wrapping Shippo's real REST API (multi-carrier rate shopping,
label purchase, tracking webhooks) -- confirm real, current endpoint/auth/webhook details during
implementation, same discipline as epics 42-43's Printful/Printify research. **Real, disclosed
credential gate**, same pattern as every other third-party adapter this session.

## 2. Scope assessment

**Medium.** New subsystem (core-only dependency) + one real third-party adapter. Same overall
shape as epics 41+42 combined, but scoped as one epic per the original backlog resolution
(shipping's surface area is smaller than fulfillment's).

## 3. Stories

1. **subsystem-and-manual-default** -- `@mercatus-liber/shipping`: the `ShippingAdapter`
   contract (`getRates`, `buyLabel`, `getTrackingStatus`), and `createManualShippingAdapter()`
   -- confirmed-for-real PirateShip has no API, so this is a genuine documented-manual-workflow
   default, not a fake stub.
2. **adapter-shippo-and-wiring** -- real `@mercatus-liber/adapter-shippo` implementation
   against Shippo's real, current API, wired into `services.ts` via a real env-var branch
   (`SHIPPO_API_TOKEN`), additive alongside the manual default.
3. **verification-and-closeout** -- verify what's testable without a live credential, honest
   credential-gap disclosure (mirroring epics 27/42/43/46), docs, closeout, merge -- this is the
   session's final epic in the full backlog sweep, note that plainly if still accurate.

## 4. Risks

- **Low.** Same credential-gate pattern proven repeatedly this session.

## 5. Open questions

None blocking.
