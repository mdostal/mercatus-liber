# @mercatus-liber/adapter-quickbooks

A real `AccountingSyncAdapter` (`@mercatus-liber/accounting-sync`, epic `accounting-erp-sync-adapter`) implementation backed by QuickBooks Online's real, documented v3 Accounting API -- OAuth2, `SalesReceipt`/`Invoice` resource creation, and real webhook signature verification. Proves accounting/ERP sync is genuinely swappable to a real provider, the same shape `@mercatus-liber/adapter-printful`/`@mercatus-liber/adapter-printify` already proved for fulfillment.

## Real credential gate

**No live QuickBooks Online account, app, or OAuth2 credentials exist in this environment.** This adapter is built and unit-tested for real correctness against QuickBooks' actual, current, documented API shape -- it is **not** exercised against a live QuickBooks sandbox or production account in this environment. Identical disclosure posture to every other credential-gated adapter in this repo (`adapter-printful`, `adapter-printify`, `adapter-shippo`, `adapter-clerk` pre-epic-56).

### Research record, not training-data recall

`src/quickbooks-types.ts`'s top doc comment is the full citation trail. Summary:

- **OAuth2** (`src/oauth.ts`): authorization endpoint `https://appcenter.intuit.com/connect/oauth2`; token endpoint `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`; scope `com.intuit.quickbooks.accounting`; `grant_type=authorization_code` for the initial exchange, `grant_type=refresh_token` to refresh. Every real refresh call returns a **new** `refresh_token` that must be stored and used next time -- this adapter's `refreshQuickBooksAccessToken` returns both tokens for exactly that reason, and `createQuickBooksHttpClient`'s own `onTokenRefreshed` hook exists so a caller can persist the rotated token.
- **API base/path** (`src/http-client.ts`): production `https://quickbooks.api.intuit.com`, sandbox `https://sandbox-quickbooks.api.intuit.com`; every request is `/v3/company/{realmId}/<entity>` plus a `minorversion` query parameter.
- **SalesReceipt/Invoice create shape** (`src/mapping.ts`, `src/quickbooks-types.ts`): a line uses `DetailType: "SalesItemLineDetail"` with a nested `SalesItemLineDetail: { ItemRef, Qty, UnitPrice }` plus a sibling top-level `Amount`; the body also requires `CustomerRef`. **One disclosed inference, not a source-confirmed verbatim fact:** the exact create-response envelope shape (`{ "SalesReceipt": {...}, "time": "..." }`) is inferred from this repo's own general familiarity with QBO's response convention, not quoted verbatim from a source excerpt -- see that file's doc comment for why a wrong guess here degrades to a clear parse error (`QuickBooks <Entity> create response did not carry a "<Entity>" key...`) rather than a silent wrong read.
- **Why `SalesReceipt`, not `Invoice`, by default**: this adapter only ever runs after `checkout.order.paid` -- i.e. the order is already paid in full by the time `syncOrder` is called. A `SalesReceipt` ("paid in full, no AR") is the real, correct QBO object for that; `Invoice` ("creates Accounts Receivable") is offered via `recordType: "invoice"` for a deployment that wants its own AR workflow instead.
- **Webhooks** (`src/webhook.ts`): real `intuit-signature` header, HMAC-SHA256 over the raw body using the app's own Verifier Token, base64-compared. Payload: `{ eventNotifications: [{ realmId, dataChangeEvent: { entities: [{ name, id, operation, lastUpdated }] } }] }`.

Two independent real gaps this adapter cannot fill by itself, injected as required config callbacks (same shape as `PrintfulFulfillmentAdapterConfig.resolveRecipient`/`resolveCatalogTarget`):

- `resolveCustomer(order)` -- this reference app has no built-in relationship between its own `customerId`/shopper data and a real QuickBooks `Customer.Id`.
- `resolveItem(skuId)` -- this reference app's catalog has no notion of QuickBooks' own Item/Product catalog at all.

A real deployment wiring this adapter for real needs to supply both -- a config table, a metadata field, or a create-on-first-order lookup against QBO's own Customer/Item endpoints (not built here, same as `adapter-printful`/`adapter-printify`'s own disclosed catalog-mapping gap).

## Testing

Every test in `test/` runs against a fake `fetch`/`QuickBooksHttpClient` double (`QuickBooksHttpClientConfig.fetchImpl`/`httpClient` injection points) -- **never a real network call**. `test/http-client.test.ts` exercises the real request shapes (paths, headers, OAuth2 refresh-and-retry-once-on-401 flow) against a recording fake; `test/adapter.test.ts` exercises `syncOrder`/`handleWebhookEvent` end to end, including a real end-to-end run through `@mercatus-liber/accounting-sync`'s own `createAccountingSyncService`; `test/oauth.test.ts` exercises the real `grant_type=refresh_token` exchange shape directly. `src/accounting-sync-adapter-compat.ts` is a compile-time (not visual) proof that this adapter's return value structurally satisfies `AccountingSyncAdapter`'s full contract.

## Usage

```ts
import { createQuickBooksAccountingSyncAdapter, QUICKBOOKS_PROVIDER } from "@mercatus-liber/adapter-quickbooks";

const adapter = createQuickBooksAccountingSyncAdapter({
  realmId: process.env.QUICKBOOKS_REALM_ID!,
  oauth: {
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    refreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN!,
  },
  async resolveCustomer(order) { /* map order.customerId / order.shippingInfo to a real QBO Customer.Id */ throw new Error("not configured"); },
  async resolveItem(skuId) { /* map skuId to a real QBO Item.Id */ throw new Error("not configured"); },
});
```

See `@mercatus-liber/accounting-sync`'s own README for how this plugs into `createAccountingSyncService`/`registerAccountingSync`, and `apps/reference-storefront/lib/services.ts`'s `QUICKBOOKS_REALM_ID`-gated branch for the real wiring shape this reference app uses.
