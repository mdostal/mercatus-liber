/**
 * QuickBooks Online Accounting API shapes this adapter actually calls,
 * researched 2026-10-18 against real, current sources -- NOT training-data
 * recall (per this story's own explicit "no real QBO credentials exist
 * anywhere in this repo... look up the real QBO Accounting API rather than
 * guessing from training data" instruction). developer.intuit.com's own
 * reference pages are JS-rendered and were truncated under this session's
 * automated fetch -- the SAME documented limitation `@mercatus-liber/
 * adapter-printful`'s own printful-types.ts top doc comment discloses for
 * developers.printful.com ("a JS-rendered API reference that truncates
 * under automated fetch, so it alone was NOT sufficient"). Confirmed instead
 * by cross-referencing multiple independent secondary sources that quote
 * Intuit's docs directly (search-engine-returned excerpts of
 * developer.intuit.com's own FAQ/reference pages, plus community
 * integration guides that reproduce real request/response JSON):
 *   - developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq
 *     (OAuth2 endpoints, token lifetimes),
 *   - developer.intuit.com/app/developer/qbo/docs/develop/webhooks (webhook
 *     header names, signature scheme),
 *   - community/SDK documentation (withone.ai's QuickBooks connector
 *     reference, cdata.com's SalesReceipts table reference, dev.to's
 *     "QuickBooks API: Complete Developer's Guide 2026") that all
 *     independently agree on the same endpoint paths and field names below.
 * One honest residual gap, same posture as adapter-printful/-printify's own
 * disclosed research gaps: no live QuickBooks Online sandbox/production
 * account exists in this environment to literally fire these requests
 * against, so this is "built and unit-tested for real correctness against
 * QBO's real, documented API shape, not exercised against a live API" --
 * identical disclosure to every other credential-gated adapter in this repo.
 *
 * Research finding 1 -- OAuth2 (confirmed via the FAQ page and corroborated
 * by two independent secondary sources): authorization endpoint
 * `https://appcenter.intuit.com/connect/oauth2`; token endpoint
 * `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` (grant_type
 * `authorization_code` for the initial exchange, `refresh_token` for
 * refreshing); scope `com.intuit.quickbooks.accounting`. Access tokens
 * expire in 3600 seconds (1 hour). Sources disagree slightly on the exact
 * refresh-token lifetime figure (one independent source states 8726400
 * seconds / 100 days flat; another describes a 24-26 hour *rotation* window
 * with a longer maximum lifetime) -- both agree on the one fact this
 * adapter's own oauth.ts actually depends on: **every real token-refresh
 * call returns a NEW refresh_token that must be stored and used on the next
 * call**, the refresh token is not static. This adapter's `OAuthTokenSet`
 * (oauth.ts) is designed around that confirmed fact, not around the
 * disputed exact expiry number.
 *
 * Research finding 2 -- the real v3 Accounting API's base URL/path pattern
 * (confirmed via the FAQ page and corroborated independently via the
 * cdata.com/withone.ai reference pages, which both quote the identical
 * `{{baseUrl}}/v3/company/{{realmId}}/<entity>` shape): production base
 * `https://quickbooks.api.intuit.com`, sandbox base
 * `https://sandbox-quickbooks.api.intuit.com`; every request path is
 * `/v3/company/{realmId}/<entity>` (`realmId` is QBO's own per-company id,
 * returned alongside the OAuth2 authorization-code callback); every request
 * additionally carries a `minorversion` query parameter (confirmed present
 * on every real example URL across sources; this adapter defaults it to 75,
 * the version the one real dated source names as current as of August
 * 2025 -- configurable, never hardcoded as a silent assumption).
 *
 * Research finding 3 -- SalesReceipt/Invoice create request/response shape
 * (confirmed identically across three independent sources: the FAQ page's
 * own quoted JSON, cdata.com's SalesReceipts table reference, and
 * withone.ai's connector reference): a line item uses `DetailType:
 * "SalesItemLineDetail"` with a nested `SalesItemLineDetail: { ItemRef:
 * { value }, Qty, UnitPrice }` object and a sibling top-level `Amount`
 * (unit price * quantity, confirmed as a required top-level field alongside
 * the nested detail, not computed by the API from Qty*UnitPrice); the
 * top-level body additionally requires `CustomerRef: { value }`. The create
 * response wraps the created entity under a key matching the entity name
 * (`{ "SalesReceipt": {...}, "time": "..." }` / `{ "Invoice": {...}, "time":
 * "..." }`) -- this exact envelope shape is the one piece of this schema
 * inferred from this repo's own general familiarity with QBO's response
 * convention rather than a source excerpt that spelled out the full
 * envelope verbatim; `QuickBooksEnvelope` below is written generically
 * (`Record<string, T> & { time: string }`) specifically so this inference,
 * if wrong about the exact key casing/shape in some minor version, degrades
 * to a clear parse failure rather than a silent wrong read -- see
 * `http-client.ts`'s `extractEntity` for where that's enforced.
 * `SyncToken`/`Id`/`DocNumber` on the response entity (confirmed via the
 * cdata.com "sparse update" reference, which documents `Id` and `SyncToken`
 * as the two fields a later update must echo back for QBO's own optimistic-
 * locking scheme) are read by this adapter's `syncOrder` (the created
 * record's `Id` becomes this subsystem's `SyncResult.externalId`) but
 * `SyncToken`-based updates are NOT implemented -- this adapter only ever
 * creates a new SalesReceipt per order, never updates one, so optimistic
 * locking never comes into play for its one real write path.
 *
 * Research finding 4 -- real, documented reason this adapter defaults to
 * `SalesReceipt`, not `Invoice`: `AccountingSyncService` (@mercatus-liber/
 * accounting-sync) only ever calls `syncOrder` from the real
 * `checkout.order.paid` event -- i.e. Stripe (or the sandbox adapter) has
 * already captured payment in full by the time this adapter runs (see
 * `packages/checkout-orders/src/service.ts`'s own `payments.payment.succeeded`
 * subscription). QuickBooks Online's own real object model distinguishes a
 * `SalesReceipt` ("payment received at time of sale, no outstanding
 * balance") from an `Invoice` ("a bill sent to a customer, creating
 * Accounts Receivable until paid separately") -- confirmed consistently
 * across every source above that describes both entities. A SalesReceipt is
 * therefore the real, correct QBO object for an order this subsystem
 * already knows is paid; `Invoice` is kept as a config option
 * (`recordType: "invoice"`) for a deployment that wants its own AR workflow
 * instead, not the default.
 *
 * Research finding 5 -- webhooks (confirmed via developer.intuit.com's own
 * webhooks doc page and independently corroborated by a community guide
 * that quotes the identical header name and verification scheme): incoming
 * webhook POSTs carry an `intuit-signature` header; verification is
 * HMAC-SHA256 over the raw request body using the app's own Verifier Token
 * (configured in the Intuit developer dashboard) as the HMAC key, base64-
 * encoded, compared against the header. Real payload shape:
 * `{ eventNotifications: [{ realmId, dataChangeEvent: { entities: [{ name,
 * id, operation, lastUpdated }] } }] }` -- `name` is the entity type (e.g.
 * `"SalesReceipt"`, `"Invoice"`), `operation` one of `Create`/`Update`/
 * `Delete`/`Merge`/`Void`/`Emailed` (confirmed set of real QBO webhook
 * operations). This adapter's `handleWebhookEvent` exists to detect a real
 * operator voiding/deleting a synced SalesReceipt directly inside
 * QuickBooks itself (a real reconciliation signal this subsystem has no
 * other way to learn about) -- it is NOT required for `syncOrder` itself to
 * work, matching `AccountingSyncAdapter.handleWebhookEvent`'s own "optional"
 * contract.
 */

export interface QuickBooksRef {
  value: string;
  name?: string;
}

export interface QuickBooksSalesItemLineDetail {
  ItemRef: QuickBooksRef;
  Qty?: number;
  UnitPrice?: number;
}

export interface QuickBooksLine {
  Amount: number;
  DetailType: "SalesItemLineDetail";
  SalesItemLineDetail: QuickBooksSalesItemLineDetail;
}

/** The real, shared shape of a `POST /v3/company/{realmId}/salesreceipt` or `.../invoice` create request body (confirmed identical for both entities across every source above). */
export interface QuickBooksCreateSalesEntityRequest {
  CustomerRef: QuickBooksRef;
  Line: QuickBooksLine[];
  DocNumber?: string;
  /** ISO 8601 date (`YYYY-MM-DD`) -- QBO defaults to its own server date when omitted (confirmed). */
  TxnDate?: string;
}

/** The subset of fields this adapter reads off a created SalesReceipt/Invoice response entity. */
export interface QuickBooksSalesEntityResponse {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TotalAmt?: number;
}

/** The real `{ "<EntityName>": {...}, "time": "..." }` create-response envelope (see Research finding 3's disclosed inference note above). */
export type QuickBooksEnvelope<T> = Record<string, T> & { time?: string };

export type QuickBooksRecordType = "SalesReceipt" | "Invoice";

/** One entity change inside a real webhook delivery's `dataChangeEvent.entities` array. */
export interface QuickBooksWebhookEntity {
  name: string;
  id: string;
  operation: "Create" | "Update" | "Delete" | "Merge" | "Void" | "Emailed";
  lastUpdated: string;
}

export interface QuickBooksWebhookEventNotification {
  realmId: string;
  dataChangeEvent: { entities: QuickBooksWebhookEntity[] };
}

export interface QuickBooksWebhookPayload {
  eventNotifications: QuickBooksWebhookEventNotification[];
}
