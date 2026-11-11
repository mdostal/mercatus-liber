# @mercatus-liber/adapter-3dapi

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that orders 3D prints from [3DAPI](https://public-api.dapi.digital) (dapi.digital), plus a client for quoting model files and estimating shipping.

**Status:** built from 3DAPI's published OpenAPI document and docs as read on 2026-11-10, and tested against a fake `fetch`. It has never been run against a live 3DAPI account. 3DAPI has no sandbox, so the first real call is a real order. Not published to npm; use it from this monorepo via `workspace:*`.

## How it works

The store sells at its own checkout and keeps the customer's payment. It then orders the print from 3DAPI as an **integrator** in **wallet mode**: 3DAPI charges the production price plus shipping to the store's 3DAPI wallet, prints the item at a production centre and ships it to the customer.

A SKU maps to a **quote**: a model file (`.stl`, `.3mf`, `.obj`, `.step`, `.stp`) that 3DAPI has sliced and priced. An order line is a quote, a quantity and the materials to print it in.

This package uses only integrator endpoints. 3DAPI's designer endpoints (`/v2/products`, `/v2/orders`) refuse integrator keys. Checkout mode, where the customer pays on a 3DAPI-hosted page, is not used.

## Setup

1. **Sign up as an integrator** at https://dapi.digital/integrator/sign-up. Use an email that has no 3DAPI seller account: a seller account cannot be converted, and one account cannot be both.
2. **Create an API key** on the integrator dashboard's API keys page. This package calls endpoints that need the scopes `orders:read`, `orders:write`, `quotes:read`, `quotes:write` and `wallet:read`. `createDapiCatalogClient(...).whoAmI()` shows the key's account kind, scopes and approval status.
3. **Quote your files** with `quoteFile` (below). Before approval an account can quote 25 files per round, plus a daily limit that 3DAPI's docs do not put a number on.
4. **Get approved.** 3DAPI approves an account once 10 of its files are approved. Submit 10 ready quotes for review (in the dashboard, or `POST /v2/integrator/approval-requests`, which this package does not wrap). People review each file, usually in 24 to 48 hours. Orders are refused with `quote_not_approved` until then.
5. **Add business billing details and a card** in the dashboard, and top up the wallet. Orders are refused with `compliance_blocked` without billing details. A business outside the EU and UK also needs a tax form (W-9, W-8BEN or W-8BEN-E). These steps only work in the dashboard, not with an API key.
6. **Map each SKU** to its quote and materials (below).
7. **Create a webhook endpoint** in the dashboard and keep its `whsec_...` secret, which is shown once. Creating an endpoint needs a signed-in dashboard session; an API key is refused, so this package cannot do it for you.

On approval 3DAPI adds $15 of sample credit, valid for 30 days. Set `useSampleCredit: true` to spend it before the wallet balance. 3DAPI applies it only to an order shipped to the account's own country.

## Usage

```ts
import { createDapiFulfillmentAdapter, dapiCatalogTargetsFrom, dapiSkuIdsFrom, DAPI_PROVIDER } from "@mercatus-liber/adapter-3dapi";

const dapi = createDapiFulfillmentAdapter({
  apiKey: process.env.DAPI_API_KEY!,
  resolveCatalogTarget: dapiCatalogTargetsFrom(mappings),
  resolveSkuId: dapiSkuIdsFrom(mappings),
  webhookSecret: process.env.DAPI_WEBHOOK_SECRET,
  onWebhookEvent: async (event) => {
    if (event.order) await saveTracking(event.order); // status, carrier, trackingNumber
  },
});

const adapters = { [DAPI_PROVIDER]: dapi }; // DAPI_PROVIDER is "3dapi"
```

### Options

| Option | What it does |
| --- | --- |
| `apiKey` | Integrator API key, sent as `x-api-key`. |
| `baseUrl`, `fetchImpl`, `httpClient` | Overrides for the API address, `fetch`, or the whole client. |
| `resolveCatalogTarget(skuId)` | Returns the SKU's `DapiCatalogTarget`. Required. |
| `resolveSkuId(line)` | Says which SKU a 3DAPI order line is, for `getOrderStatus`. |
| `resolveRecipient(orderId)` | Loads shipping details when the order arrives without a recipient. |
| `holdOrders` | Places nothing at 3DAPI. See below. |
| `useSampleCredit` | Sends `use_sample_credit: true`. |
| `webhookSecret` | The endpoint's `whsec_...` secret. |
| `verifyWebhookSignature(rawBody, signature)` | Replaces the built-in signature check. |
| `webhookToleranceSeconds` | Allowed clock difference for a delivery. Default 300. |
| `webhookEventStore` | Where handled event ids are kept. Default: in memory. |
| `onWebhookEvent(event)` | Called with each verified event not handled before. |

### Mapping SKUs

A `DapiCatalogTarget` is stored per SKU in a `ProviderCatalogMappingRepository` under the provider `"3dapi"`:

```ts
{ quoteId: "qte_...", materials: ["mat_..."] }                       // slots 1, 2, 3... in order
{ quoteId: "qte_...", materials: [{ slot: 2, material: "mat_..." }] } // named slots
{ quoteId: "qte_...", useSuggestedMaterials: true }                   // the quote's suggested materials
```

Add `extras: [{ extra: "xtr_...", quantityPerUnit: 4 }]` to ship approved bought-in parts with every unit.

Set `materials` or `useSuggestedMaterials`, not both. 3DAPI refuses both together. Its spec does not say what a line with neither does, so this package refuses that mapping. `materials` must cover exactly the slots listed in the quote's `suggested_materials`; 3DAPI checks that when the order is placed (`material_slots_mismatch`). A suggested material whose `match` is `approximate` is visibly different from the colour in the file, so check it before using `useSuggestedMaterials`.

### Placing orders

`submitOrder` places one 3DAPI order for the lines it is given:

- It refuses, before calling 3DAPI, a recipient without a street line, city, postal code, country, name or email. 3DAPI itself accepts an address with no postal code for countries that have none; this package does not.
- It sends the Mercatus order id as the order's `reference`. An id that does not fit 3DAPI's pattern (letters, digits, `_`, `-`, up to 100 characters) is replaced by `ml-` plus a hash of it. UUIDs fit.
- Before ordering it asks 3DAPI for orders with that reference. If one exists that is not cancelled, it returns that order and places nothing. If none does, it orders with an `Idempotency-Key` built from the reference, which 3DAPI honours for 24 hours.
- If the only orders with the reference are cancelled, it places a new one.

A 3DAPI order has one status for all its lines, so every line of an order reports the same status.

| 3DAPI status | Mercatus status | Note |
| --- | --- | --- |
| `awaiting_payment` | `held` | Checkout-mode orders only; wallet orders come back `paid`. |
| `paid`, `assigned`, `in_production` | `submitted` | |
| `on_hold` | `submitted` | Paid and with 3DAPI, waiting on stock. |
| `rejected` | `submitted` | A production partner refused it. 3DAPI reassigns it or cancels and refunds it. |
| `shipped` | `shipped` | |
| `returned` | `shipped` | Sent back after shipping. Mercatus has no returned status. |
| `completed` | `delivered` | 3DAPI: "delivered and settled". |
| `cancelled` | `unfulfilled` | Refunded in full; nothing ships. |

`trackingNumber` is 3DAPI's `shipping.tracking_number`. `trackingUrl` is always `null`: 3DAPI gives a carrier name and a tracking number, and no tracking URL. The carrier name is on `event.order.carrier` in `onWebhookEvent`; `FulfillmentLineRecord` has no field for it.

`getOrderStatus` finds the order by its reference. 3DAPI order lines carry no id of yours, so it needs `resolveSkuId` to name each line's SKU. `dapiSkuIdsFrom(mappings)` does that by looking up which SKU is mapped to the line's quote. Without it a line is reported under the SKU id `3dapi-item-<line id>`. Two SKUs mapped to the same quote and the same materials cannot be told apart.

### Holding orders

3DAPI has no draft order. A wallet order is paid and goes to production when it is created. So `holdOrders: true` does not contact 3DAPI at all: `submitOrder` checks the address and the SKU mappings, then reports each line as `held` with `externalOrderId: null`.

**A held order is released by submitting it again with `holdOrders` off.** Nothing at 3DAPI will pick it up by itself. Held orders are remembered only in the adapter's memory, so `getOrderStatus` returns nothing for them after a restart.

To cancel a placed order, call `createDapiHttpClient({ apiKey }).cancelOrder(orderId)`. 3DAPI refunds an order that is still `paid` and refuses one a production partner has started.

### Webhooks

3DAPI signs each delivery with two headers that are both needed to verify it: `X-Dapi-Webhook-Signature` and `X-Dapi-Webhook-Timestamp`. `handleWebhookEvent(rawBody, signature)` takes one string, so pass it both, combined by `dapiWebhookSignatureFromHeaders`:

```ts
import { dapiWebhookSignatureFromHeaders } from "@mercatus-liber/adapter-3dapi";

export async function POST(request: Request) {
  const rawBody = await request.text(); // the raw body, before any JSON parsing
  await dapi.handleWebhookEvent!(rawBody, dapiWebhookSignatureFromHeaders(request.headers));
  return new Response(null, { status: 204 });
}
```

The combined string is `t=<timestamp>,v1=<signature header>`. That format belongs to this package, not to 3DAPI.

`handleWebhookEvent` throws, and does not call `onWebhookEvent`, when no secret is configured, when the signature does not match (compared in constant time), or when the timestamp is more than 5 minutes from the server's clock. A delivery whose event id was already handled returns normally without calling `onWebhookEvent` again. An event id counts as handled only after `onWebhookEvent` returns, so if your handler throws, 3DAPI's retry is processed.

The default event store keeps the last 5,000 event ids in memory. It forgets them on restart and is not shared between server instances. 3DAPI retries a failed delivery for 24 hours, so pass a database-backed `webhookEventStore` (`has(id)`, `add(id)`) if that matters. 3DAPI expects a 2xx answer within 10 seconds.

Subscribe the endpoint to the `order.*` events. `event.order` holds the 3DAPI order id, the `reference`, the 3DAPI status, the mapped Mercatus status, the carrier and the tracking number. The adapter does not write these anywhere; `onWebhookEvent` is where your store saves them.

## Quoting and pricing

```ts
import { createDapiCatalogClient } from "@mercatus-liber/adapter-3dapi";

const client = createDapiCatalogClient({ apiKey });
const materials = await client.listMaterials();
const { quote, unitCostCents } = await client.quoteFile({ fileName: "bracket.stl", contentType: "model/stl", bytes });
const shipping = await client.estimateShipping({ country: "DE", items: [{ quoteId: quote.id, quantity: 1 }] });
const wallet = await client.getWallet();
```

- `listMaterials()`: the material catalog, every page. Each material has a name, colour, `color_hex` and `filament_type`.
- `uploadFile`, `createQuote`, `getQuote`, `waitForQuote`, `quoteFile`: upload a model file, start a quote and wait for its price. Slicing usually takes one to a few minutes. `unitCostCents` is the production price of one unit.
- `estimateShipping`: what an order would be charged for shipping to a country, in cents, without VAT. It creates nothing and works before the account is approved.
- `getWallet()`: wallet balance, sample credit and pending withdrawals.
- `whoAmI()`: the key's account kind, scopes and approval status.

### Products as data

`planDapiProduct(spec, quotes)` takes a `DapiProductSpec` (a product whose variants each name a quote, materials and a retail price) and returns each SKU with its cost and margin, plus the variants it skipped and why. `applyDapiProduct({ catalog, mappings, routing }, plan)` creates the product and SKUs, stores each SKU's mapping and routes it to `"3dapi"`. Running it again creates nothing new and keeps prices changed in the admin, unless you pass `{ updatePrices: true }`.

The planned cost is the quote's unit price. It leaves out shipping and extras, and 3DAPI charges less per unit at larger quantities, so the real cost of a multi-unit order can be lower. Margin can be negative; check it before publishing.

`applyDapiProduct`'s catalog interface is written to match `@mercatus-liber/catalog`'s `CatalogService`, as the Printful adapter's is. This package does not depend on the catalog package, so that match is not checked by the compiler.

## Costs and limits 3DAPI states

- Quoting is free. There is no monthly fee and no minimum order quantity.
- A wallet order costs the production price plus shipping. The production price already includes 3DAPI's platform fee; the integrator docs do not state its rate.
- When the wallet balance is short, the difference is charged to the saved card as a top-up, with VAT on the top-up where it applies to the store's billing country. With no saved card the order is refused (`insufficient_balance`) and nothing is created.
- Shipping is priced by destination zone and by the weight tier of the heaviest item: small up to 600 g, medium up to 2 kg, large above. Each further item adds the zone's per-item price, except items under 100 g on a line without extras.
- 3DAPI delivers worldwide except Russia, Belarus, Iran and Syria (`shipping_destination_not_served`).
- Orders are made at a production centre near the buyer. Where the buyer's region has none, the order ships from the closest one and the buyer pays import duties on delivery.
- Production takes 3 to 5 business days from payment. Delivery takes 1 to 3 business days locally and 5 to 10 internationally.
- An order line takes 1 to 10,000 units and an order up to 100 lines.
- Rate limits: 500 requests per minute per key, and 60 per minute for creating quotes, uploads and orders and cancelling orders.
- Quote files can be up to 250 MiB. An upload id expires after 24 hours and works in one quote.
- 3DAPI's quickstart also says "Order to Quote ratio 1:1500" and does not explain it.

## Not covered

- Checkout mode, where the customer pays 3DAPI.
- Designer endpoints: products, variants, stock, storefront orders.
- Submitting files for account approval, creating API keys, top-ups, cards, withdrawals and billing details.
- Creating or changing webhook endpoints.
- Creating extras. A mapping can reference an extra that already exists and is approved.
- Quality-control tickets, refunds after production starts, and returns. 3DAPI handles those by email.
- Retrying after a rate limit. A `429` surfaces as a `DapiApiError` with the code `rate_limited`.
- Saving webhook status changes. `onWebhookEvent` hands them to your code.

## Errors

A refused request throws `DapiApiError` with `status`, 3DAPI's stable `code`, `apiMessage` and `details`. Branch on `code`. Ones a store is likely to meet when ordering: `quote_not_approved` (account not approved yet), `compliance_blocked` (billing details missing; `details.fix_url` links to the fix), `insufficient_balance`, `payment_failed`, `quote_not_ready`, `material_slots_mismatch`, `shipping_destination_not_served`, `production_unavailable`.

3DAPI keeps a `5xx` answer under its idempotency key and returns it again for 24 hours, because the write may have happened. Its docs say to check the resource and then retry with a new key, and the adapter does that: after a `5xx`, submitting the order again looks for an order with the reference, returns it if the first attempt did go through, and otherwise orders under a new key. The adapter remembers the `5xx` in memory, so the first resubmission after a restart gets the stored `5xx` back once and the one after that goes through. This relies on 3DAPI's order list showing a new order straight away, which its docs do not state.
