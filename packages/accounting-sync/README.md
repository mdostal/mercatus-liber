# @mercatus-liber/accounting-sync

Pushes a paid order into a real accounting/ERP system of record. Owns the `AccountingSyncAdapter` contract every real provider adapter implements (see `@mercatus-liber/adapter-quickbooks`), the `AccountingSyncRecord` bookkeeping for "did order X ever get synced, and with what result," and `registerAccountingSync`, which fires a sync off the real `checkout.order.paid` event.

This epic (`accounting-erp-sync-adapter`) traces directly to a real, disclosed gap: `.pHive/planning/epic-backlog.md` row 77 (`integrations-catalog-and-ecosystem-audit`, story `ica-02`) found that **no adapter or interface anywhere in this codebase pushes a completed order into a merchant's real accounting system** -- paid/fulfilled orders never reach QuickBooks, Xero, or anything else. That same row named QuickBooks Online as the natural reference implementation and Xero as "the natural second." See `.pHive/epics/accounting-erp-sync-adapter/docs/design-discussion.md` for the full design record.

## Depends on

`@mercatus-liber/core` only. Reads order data via a narrow structural interface -- `OrderLookup` (`getOrder(id) -> SyncableOrder | null`) -- satisfied structurally by checkout-orders' `CheckoutOrdersService` at the app-composition layer, never imported directly at runtime (`@mercatus-liber/checkout-orders` is a `devDependency` only, used solely by a compile-time type-compatibility proof -- see `src/order-lookup-compat.ts`). Mirrors `@mercatus-liber/fulfillment`'s and `@mercatus-liber/internal-bi`'s own narrow-dependency discipline exactly.

## What's live-verified vs. credential-gated

This package itself has **no third-party dependency at all** -- it's pure orchestration (the adapter contract, the in-memory sync-record repository, the event subscriber). Every real behavior here (idempotent sync, failure recording, the fire-and-forget event dispatch) is exercised by real unit tests in `test/accounting-sync.test.ts` against a fake adapter and a fake `OrderLookup` -- no network call, no external credential needed for this package to be fully real and tested.

The actual third-party credential gate lives one layer down, in `@mercatus-liber/adapter-quickbooks` (see that package's own README) -- no real QuickBooks Online account/credentials exist in this environment.

## Trigger point: why `checkout.order.paid`, and why it's not awaited inline

`registerAccountingSync` subscribes to `checkout.order.paid` -- the one real, currently-fired event marking "payment captured in full" (see `packages/checkout-orders/src/service.ts`'s own subscription to `payments.payment.succeeded`). Unlike `@mercatus-liber/inventory`'s and `@mercatus-liber/internal-bi`'s own `checkout.order.paid` subscribers (which await their handler inline -- fine, since they only touch this process's own in-memory/Postgres state), this subscriber deliberately does **not** await `AccountingSyncService.syncOrder` inline, because that call makes a real outbound HTTP request to a third-party accounting API whose latency must never be added to the (synchronous, in-process) event-bus's publish chain -- which, for `checkout.order.paid`, is itself fired from inside the real payments webhook handler's own event chain. See `src/subscriber.ts`'s own doc comment for the full reasoning, and `.pHive/epics/accounting-erp-sync-adapter/docs/design-discussion.md` §3.

`AccountingSyncService.syncOrder` itself never throws -- a failed sync is recorded (`status: "failed"`, the real error message) and returned, not rethrown -- which is what makes true fire-and-forget safe here (no unhandled promise rejection).

## Usage

```ts
import { createAccountingSyncService, createInMemoryAccountingSyncRepository, registerAccountingSync } from "@mercatus-liber/accounting-sync";
import { createQuickBooksAccountingSyncAdapter, QUICKBOOKS_PROVIDER } from "@mercatus-liber/adapter-quickbooks";

const sync = createAccountingSyncService({
  orders: checkout, // checkout-orders' CheckoutOrdersService structurally satisfies OrderLookup
  adapter: createQuickBooksAccountingSyncAdapter({ /* ... */ }),
  repository: createInMemoryAccountingSyncRepository(),
  provider: QUICKBOOKS_PROVIDER,
});

registerAccountingSync({ events, sync });
```

Wired into `apps/reference-storefront/lib/services.ts` only when `QUICKBOOKS_REALM_ID` and either an access token or OAuth refresh credentials are configured -- unset by default, zero behavior change otherwise. See that file's own `ACCOUNTING_SYNC_PROVIDER`/`accountingSync` branch.
