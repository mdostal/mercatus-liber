# Design discussion: accounting-erp-sync-adapter

## 1. Why this epic, and why now

Real gap finding, not speculative: `.pHive/planning/epic-backlog.md` row 77
(`integrations-catalog-and-ecosystem-audit`, story `ica-02`, 2026-10-07) researched 7
integration categories against real, current provider docs and surfaced three real
new-epic-candidates, recorded (not planned or executed) per this repo's own "gap audits
record candidates, don't auto-build them" convention. The first of those three is this
epic, quoted verbatim from that row: *"no adapter/interface anywhere pushes a completed
order into a merchant's real accounting system of record; QuickBooks Online as reference
implementation, Xero as the natural second."*

Confirmed again directly, by reading the real code rather than trusting the backlog row's
own characterization: `packages/checkout-orders/src/service.ts` publishes
`checkout.order.paid` once a payment is confirmed; `packages/fulfillment` and
`packages/internal-bi` both already subscribe to it (`registerInventorySync`,
`registerBiEventLogSync`); nothing in this repo calls out to QuickBooks, Xero, or any
other accounting/ERP system at all -- grepped `packages/` for "quickbooks", "xero",
"accounting", "erp" before this epic: zero real matches outside planning docs. The gap is
real and exactly as described.

## 2. Where the `AccountingSyncAdapter` interface lives

Two real options were weighed, per this story's own explicit instruction to make this
judgment call and document it:

**Option A -- an extension point on `@mercatus-liber/plugins`' event-bus system.**
Read `packages/plugins/src/types.ts`/`registry.ts`/`order-notification-plugin.ts` in full
first. `PluginContext` is deliberately minimal (`{ events: EventBus }` only, see that
file's own doc comment: "The entire default surface a plugin gets... Nothing else"), and
`PluginRegistry.initAll` is explicitly best-effort -- "one plugin's init failure never
prevents another plugin from initializing," achieved by **swallowing every plugin init
error entirely** (`registry.ts`'s own comment: "A real deployment would log this; this
reference registry deliberately swallows it"). That swallowing is fine for
`order-notification-plugin`'s own job (an in-memory notification log nobody depends on
for correctness), but it is the wrong trust model for an accounting sync: a silently
swallowed failure here means a real order never reaches the merchant's real books, with
no record anywhere that it didn't. `@mercatus-liber/accounting-sync`'s own
`AccountingSyncRecord` (one row per order, `status: "synced" | "failed"`, carrying the
real error message) is exactly the durable, inspectable failure trail a plugin can't
give for free. A plugin also has no narrow, typed contract of its own beyond
`init(ctx)` -- there is no `AccountingSyncAdapter`-shaped thing to swap in and unit-test
against a fake the way `FulfillmentAdapter`/`PaymentAdapter` are.

**Option B (chosen) -- a small, narrow "home" package, exactly the
`FulfillmentAdapter`/`packages/fulfillment` precedent.** `packages/fulfillment`'s own
`package.json` description states its own reasoning for existing as its own package
rather than, say, a method bolted onto `checkout-orders`: a narrow structural dependency
on order data (`OrderLookup`), a swappable per-provider `*Adapter` contract, and a real
orchestration service, all owned by one small package other subsystems depend on
one-directionally. `accounting-sync` follows that exact shape: `AccountingSyncAdapter`
(the swappable contract), `OrderLookup` (the narrow structural read dependency, not an
import of `checkout-orders`), `AccountingSyncRecord`/`AccountingSyncRepository` (this
subsystem's own durable bookkeeping, mirroring `FulfillmentLineRecord` being
`fulfillment`'s own record rather than a field on `Order`), and
`createAccountingSyncService` (the orchestration layer, mirroring
`createFulfillmentService`). This is the real, chosen architecture -- see
`packages/accounting-sync/src/types.ts`'s own doc comments for the field-by-field
structural-compatibility reasoning.

A plugin could *additionally* wrap this service later (e.g. an admin "accounting sync
status" panel registered as a plugin) -- that's compatible with, not exclusive of, this
choice; it just isn't where the actual sync logic or its failure-tracking should live.

## 3. Trigger point: `checkout.order.paid`, fire-and-forget, never awaited inline

Read `packages/checkout-orders/src/service.ts`, `packages/fulfillment/src/service.ts`,
and `packages/inventory/src/subscriber.ts`/`packages/internal-bi/src/subscriber.ts`
before deciding this. The real, currently-fired events on an order's lifecycle are
`checkout.order.placed` (order created, payment session started) and
`checkout.order.paid` (payment confirmed -- fired from checkout-orders' own subscription
to `payments.payment.succeeded`). There is **no** `checkout.order.fulfilled` event
anywhere in this codebase today -- `Order.status` has a `"fulfilled"` value in its type,
but nothing in `checkout-orders`, `fulfillment`, or anywhere else actually transitions an
order to it or publishes an event for it (confirmed by grepping every real `.publish(`
call site). The epic-backlog row's own "paid/fulfilled orders never reach any accounting
system" framing is accurate as a description of the gap, but the one real, fireable
trigger today is `checkout.order.paid` -- that's what this epic wires to. A genuine
`checkout.order.fulfilled` event is a separate, real gap in `checkout-orders`/
`fulfillment` themselves, out of this epic's scope (not invented here just to have a
second trigger).

**Why not awaited inline**, unlike `registerInventorySync`/`registerBiEventLogSync`'s own
`checkout.order.paid` handlers: those two only ever touch this process's own in-memory/
Postgres state -- effectively instantaneous. `AccountingSyncService.syncOrder` calls a
real third-party adapter that makes a real outbound HTTP request (QuickBooks Online's
real v3 API). `@mercatus-liber/core`'s `createInMemoryEventBus` is explicitly documented
as "synchronous-per-publish (handlers are awaited in registration order before publish()
resolves)" -- and `checkout.order.paid` is itself published from inside checkout-orders'
own subscription to `payments.payment.succeeded`, i.e. from the real Stripe (or sandbox)
webhook handler's own event chain. Awaiting a real external HTTP call there would add
that call's full latency -- and any transient failure -- to the webhook handler's own
response time, which this epic's own explicit requirement ("fire-and-forget... never
blocking checkout") rules out.

So `registerAccountingSync` (`packages/accounting-sync/src/subscriber.ts`) dispatches
`sync.syncOrder(orderId)` and returns immediately, without awaiting it. This is safe
specifically because `AccountingSyncService.syncOrder` is designed to **never throw** --
a failed sync is recorded (`status: "failed"`, the real error message) and returned, not
rethrown (see `service.ts`'s own doc comment) -- closing the one real risk of
fire-and-forget dispatch (an unhandled promise rejection) at its source rather than
papering over it with a blind `.catch(() => {})`. The one case that can still reject
(`OrderNotFoundForAccountingSyncError`, a genuine caller/race-condition error, not an
adapter failure) is caught and logged by the subscriber itself.

A real multi-instance/queued deployment would eventually replace this in-process
dispatch with a durable queue -- the event bus's own doc comment already names a
queue/Redis-backed `EventBus` as a later, separate adapter concern; this epic doesn't
build one, matching every other subsystem's "zero-infra default, real queueing is an
adapter's job" posture in this repo.

## 4. Idempotency

The in-process `EventBus` is documented at-least-once delivery. `AccountingSyncService.
syncOrder` is idempotent for an already-`"synced"` order (returns the existing record,
never calls the adapter again) -- a redelivered `checkout.order.paid` event, or a manual
admin "retry sync" action on an order that already synced, can never double-book the same
order in the real accounting system. A prior `"failed"` record IS retried on the next
call -- the entire point of recording a failure is to be able to fix the real cause (a
bad credential, a missing customer/item mapping) and try again.

## 5. Why QuickBooks Online, and why `SalesReceipt` not `Invoice` by default

QuickBooks Online was named directly in the epic-backlog row as "the reference
implementation," Xero as "the natural second" -- Xero is not built here, same "ship the
first real provider, name the second as a credible follow-up" posture `dropship-merch-
address-wiring`'s own design-discussion.md took for Printful-first/Printify-second.

Real research (`packages/adapter-quickbooks/src/quickbooks-types.ts`'s own top doc
comment is the full citation trail; developer.intuit.com's own reference pages are
JS-rendered and truncated under this session's automated fetch -- the same documented
limitation `adapter-printful`'s own research hit for developers.printful.com, worked
around the same way: cross-referencing multiple independent secondary sources that quote
Intuit's docs directly, rather than guessing from training data) confirms QuickBooks
Online's real object model distinguishes a `SalesReceipt` ("payment received at time of
sale, no outstanding balance") from an `Invoice` ("creates Accounts Receivable until paid
separately"). `AccountingSyncService.syncOrder` only ever runs from the real
`checkout.order.paid` event -- i.e. Stripe (or the sandbox adapter) has already captured
payment in full by the time this subsystem learns about the order. A `SalesReceipt` is
therefore the real, correct default QBO object; `Invoice` is kept as a configurable
option (`recordType: "invoice"`) for a deployment that wants its own AR workflow instead,
not invented as a false default.

## 6. Scope

**In scope:**
1. `packages/accounting-sync` -- `AccountingSyncAdapter` interface, `OrderLookup`,
   `AccountingSyncRecord`/`AccountingSyncRepository` (+ in-memory reference
   implementation), `createAccountingSyncService` (idempotent `syncOrder`, never
   throws), `registerAccountingSync` (the real `checkout.order.paid` fire-and-forget
   trigger).
2. `packages/adapter-quickbooks` -- real `AccountingSyncAdapter` implementation against
   QuickBooks Online's real, documented v3 Accounting API: OAuth2 (authorization-code +
   refresh-token grants, real token/authorize endpoints), `SalesReceipt`/`Invoice`
   creation (`POST /v3/company/{realmId}/salesreceipt` or `.../invoice`), real webhook
   signature verification (`intuit-signature`, HMAC-SHA256).
3. Real tests against fakes (a fake `fetch`/`QuickBooksHttpClient` double, never a real
   network call) for both packages.
4. Wiring into `apps/reference-storefront/lib/services.ts`'s established env-var-branch
   pattern: `QUICKBOOKS_REALM_ID` set and truthy, plus either `QUICKBOOKS_ACCESS_TOKEN` or
   the full `QUICKBOOKS_CLIENT_ID`/`QUICKBOOKS_CLIENT_SECRET`/`QUICKBOOKS_REFRESH_TOKEN`
   triple, builds the real adapter and registers the sync trigger. Unconfigured (the
   default -- unset in every demo/deploy config in this repo today), `services.accountingSync`
   is `null` and nothing is registered: zero behavior change.
5. READMEs for both new packages disclosing exactly what's real/tested vs.
   credential-gated, matching `adapter-printful`/`adapter-clerk`'s own disclosure voice.

**Explicitly out of scope:**
- A real QuickBooks Online developer account/app, OAuth2 app registration, or sandbox
  company -- no such credentials exist in this environment (same "Real credential gate"
  disclosure as epics 42/43/46/56 pre-verification).
- `resolveCustomer`/`resolveItem`'s real data sources -- this reference app's catalog and
  customer data have no built-in relationship to QuickBooks' own Customer/Item catalogs
  (same shape of gap `adapter-printful`/`adapter-printify`'s own `resolveCatalogTarget`
  disclose); a real deployment supplies these, not fabricated here.
- Xero (named as "the natural second" in the original gap finding) -- a credible, real
  follow-up epic, not built here.
- A genuine `checkout.order.fulfilled` event in `checkout-orders`/`fulfillment` (see §3)
  -- a separate, real gap, out of this epic's scope.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Fire-and-forget dispatch loses a sync failure silently | `AccountingSyncService.syncOrder` always records a `"failed"` record with the real error message; the subscriber additionally logs via `console.error` rather than swallowing silently (contrast with `PluginRegistry.initAll`'s own disclosed swallow-everything posture, §2) |
| QuickBooks' real create-response envelope shape is a disclosed inference, not source-confirmed verbatim | `createQuickBooksHttpClient`'s `extractEntity` throws a clear, honest parse error naming the exact missing key rather than returning `undefined` or a fabricated id if the inference is wrong |
| A redelivered `checkout.order.paid` event double-books an order | `syncOrder` is idempotent for an already-`"synced"` record (§4) |
| OAuth2 refresh token rotates on every real refresh call | `QuickBooksOAuthTokenSet` carries both tokens; `createQuickBooksHttpClient`'s `onTokenRefreshed` hook lets a caller persist the new one |
| `resolveCustomer`/`resolveItem` have no real mapping data in this reference app | Same disclosed-gap posture as `adapter-printful`/`adapter-printify`'s `resolveCatalogTarget` -- throws a clear, honest error naming exactly what's missing, never fabricates a QBO id |

## 8. Scale assessment

**Medium.** Two new small packages (`accounting-sync`, `adapter-quickbooks`), one new
env-var branch in `lib/services.ts`, no change to any existing package's public contract.
Proceeding directly to stories.
