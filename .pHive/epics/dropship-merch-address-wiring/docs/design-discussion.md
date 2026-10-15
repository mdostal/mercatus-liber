# Design discussion: dropship-merch-address-wiring (epic 82)

## 1. Why this epic, and why now

Real user ask, 2026-10-15: "plan out the dropshipping plugin integrations for us to do our own
custom merch -- the dragon logo on shirts and stuff -- ink or one of the printshop
integrations should work for it and we just feed the addresses and stuff across." Traced this
to its real origin: `/Users/mdostal/Documents/work/personal/shop` (shop.mdostal.com, "the
dragon-branded maker shop," `SHOP-VISION.md` §"What we sell," item 4: "Merch -- dragon-branded,
print-on-demand candidates"). This is a separate repo that vendors Mercatus Liber's packages
as local tarballs, not this repo's own demo content.

The provider-agnostic foundation already exists and is already done: epics 41
(`fulfillment-routing`), 42 (`adapter-printful`), 43 (`adapter-printify`) all shipped
2026-09-09/10. `packages/fulfillment` has a real `FulfillmentAdapter` interface,
`createFulfillmentService`, routing-by-SKU, and a manual/self-fulfillment default.
`packages/adapter-printful` and `packages/adapter-printify` are real, tested third-party
wrappers with real address-mapping types (`PrintfulRecipientAddress`,
`PrintifyRecipientAddress`), real order-submission request/response shapes, and (Printify)
real webhook signature verification -- both disclosed as live-verification-pending a real
provider credential, same as every other credential-gated integration in this repo.

**What's actually missing, confirmed by reading the real code, not assumed:** no shipping
address flows through this path at all, anywhere. `packages/fulfillment/src/types.ts`'s
`OrderLookup.getOrder()` returns only `{ id, items }`. `SubmitFulfillmentOrderInput` (what
`FulfillmentService.submitOrder` hands each adapter) has only `orderId` and `items`. Neither
carries a recipient address, name, phone, or email -- so even with a real Printful/Printify
adapter fully wired and credentialed, there is today no path for a real customer's real
shipping address to ever reach it. Separately, `checkout-orders`' own `ShippingInfo` (`{ name,
email, address }`) stores the whole address as **one free-text string**, not structured
fields -- real POD APIs need structured fields (street lines, city, state/region code,
postal code, country code) for reliable label generation, not a blob to parse.

This is the real, concrete version of "we just feed the addresses and stuff across": two real
gaps, both in `packages/checkout-orders` and `packages/fulfillment`, neither in the two POD
adapter packages themselves (those are already correctly shaped to receive a structured
address once one exists upstream).

## 2. Recommendation: which provider

Reaffirming the 2026-09-09 research (`.pHive/planning/backlog-addendum-merch-fulfillment-2026-09-09.md`),
re-checked rather than assumed stale: **Printful first.** Single-vendor model (no per-SKU
provider-routing complexity Printify's marketplace model has), draft-then-confirm order flow
with a prepaid Wallet (no charge until a real order is confirmed, so the integration can be
built and tested at $0), and real mockup-generation API for placing the dragon logo on a
product template. Printify remains a credible second adapter later -- already built, same gap
applies to it (it is equally blocked on the same missing address plumbing, not on anything
specific to Printify) -- but isn't needed to ship the first wave of merch.

**One thing to re-verify, not re-assume, before building against either in this pass:**
Printful v2's webhook signature/HMAC verification format was explicitly flagged unverified in
September; Printify's `verifyPrintifySignature` is already real and implemented. If Printful's
webhook verification is still undocumented/unclear when this is actually built, that's a real
reason to lean on polling (`getOrderStatus`) instead of webhooks for the first pass, or to
re-weigh Printify -- confirm live against Printful's current docs when story dp-02 below is
actually executed, don't assume September's finding is still accurate 5+ weeks later.

## 3. Scope

**In scope (mercatus-liber side -- benefits every consumer of these packages, not just shop):**
1. Add a real structured address shape to `packages/checkout-orders`: extend `ShippingInfo`
   (or add a new structured field alongside the existing free-text `address` for backward
   compatibility -- decide which during implementation, the existing `discountTotal`/
   `appliedPromotionCode` additive-nullable-field precedent in `Order` is the established
   pattern to follow) with real fields a shipping label actually needs: recipient name
   (already present), street line 1, street line 2 (optional), city, state/region code,
   postal code, ISO country code, phone (optional but Printful/Printify both accept it).
2. Extend `OrderLookup.getOrder()`'s return shape to include the real shipping address, and
   extend `SubmitFulfillmentOrderInput` to carry it through to `FulfillmentAdapter.submitOrder()`.
   Update `FulfillmentService.submitOrder`'s real call site accordingly. Update
   `createManualFulfillmentAdapter` (ignores it, same as today) and confirm
   `createPrintfulFulfillmentAdapter`/`createPrintifyFulfillmentAdapter`'s existing address-
   mapping functions (`PrintfulRecipientAddress`/`PrintifyRecipientAddress` construction) now
   receive real data instead of being unreachable dead code.
3. Real tests: a full order with a real structured address, routed to Printful (or Printify),
   submitted through a fake HTTP client, proving the exact real address fields arrive in the
   exact shape Printful's/Printify's own order-submission API expects.
4. Re-verify Printful's v2 webhook signature format live against current docs (see §2) and
   adjust the recommendation between polling-first vs. webhook-first accordingly before
   closing this epic.

**Explicitly out of scope (shop.mdostal.com's own job, a separate repo, not this one):**
- Vendoring the new `@mercatus-liber/fulfillment`/`@mercatus-liber/adapter-printful` package
  builds into `shop`'s own `vendor/` tarballs and wiring `createPrintfulFulfillmentAdapter`
  into `shop/lib/services.ts`'s adapters map (today it only registers the manual adapter --
  confirmed by reading that file directly).
- Creating the real Printful account, funding its Wallet, uploading the real dragon logo
  artwork at print spec, and building the actual shirt/mug product templates/mockups --
  business/manual steps in Printful's own dashboard, not code.
- Dropping the real Printful API token into Portunus (a new project, e.g.
  `shop-mdostal-com-commerce`, not `mercatus-liber-commerce` -- this is a different business/
  deployment) and into shop's real Vercel env.
- Routing the real dragon-merch SKUs to the `"printful"` provider key via
  `fulfillmentRouting.setProviderForSku` once those SKUs exist in shop's own catalog.

That follow-on work is real and should be planned as its own epic in the `shop` repo (it has
its own `.pHive`) once this epic ships a real package version it can vendor -- not duplicated
here, and not blocked on this session doing it, since that's a separate codebase.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Expanding `ShippingInfo` breaks existing callers/tests that construct it today | Additive optional fields where possible (mirrors the `discountTotal`/`appliedPromotionCode` precedent), existing free-text `address` field untouched/not removed |
| Printful's real webhook signature format is still unclear when this is built | Re-verify live against current docs; fall back to `getOrderStatus` polling rather than guessing at an HMAC scheme |
| Threading a new field through `OrderLookup` ripples into other consumers of that interface | `OrderLookup` is intentionally narrow/structural (per design-discussion precedent already in `packages/fulfillment`) -- check `assertCheckoutOrdersServiceSatisfiesOrderLookup` and every other real implementer before widening the interface, not just the one call site |

## 5. Scale assessment

**Medium.** Two real packages touched (`checkout-orders`, `fulfillment`), no new package, no
new external integration surface (the POD adapters already exist) -- just completing a real,
confirmed gap in data flow between them. Proceeding directly to stories.
