# @mercatus-liber/adapter-printful

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that submits orders to Printful.

**Status:** in production use by shop.mdostal.com (orders since 2026-11); the catalog reads below were checked against the live v2 API on 2026-11-06 and 2026-11-20. Enabled by `PRINTFUL_API_TOKEN`, with optional `PRINTFUL_STORE_ID`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createPrintfulFulfillmentAdapter, PRINTFUL_PROVIDER } from "@mercatus-liber/adapter-printful";

const printful = createPrintfulFulfillmentAdapter({
  apiToken: process.env.PRINTFUL_API_TOKEN!,
  storeId: process.env.PRINTFUL_STORE_ID,
  resolveRecipient: async (orderId) => loadRecipient(orderId),
  resolveCatalogTarget: async (skuId) => loadPrintfulTarget(skuId),
});

// Register it with the service under its provider key:
const adapters = { [PRINTFUL_PROVIDER]: printful };
```

You supply two callbacks: `resolveRecipient` loads the shipping address for an order, and `resolveCatalogTarget` maps your SKU to a `PrintfulCatalogTarget`. Without that mapping an order cannot be submitted.

## Webhooks

Set `webhookSecretKeyHex` to verify incoming webhooks, or `verifyWebhookSignature` to replace the verifier, and `onWebhookEvent` to receive parsed events. `printfulWebhookSignatureFrom(headers)` reads the `x-pf-webhook-signature` header to pass as the signature. With neither a secret nor a verifier, every delivery is refused.

`printfulOrderStatusUpdateFrom(event)` turns an event into a status update for `@mercatus-liber/fulfillment`'s `createProviderOrderStatusRecorder`, which publishes `fulfillment.order.status_changed`:

```ts
onWebhookEvent: async (event) => {
  const update = printfulOrderStatusUpdateFrom(event);
  if (update) await recorder.record(PRINTFUL_PROVIDER, update);
},
```

- `shipment_sent` (v2) and `package_shipped` (v1) → `shipped`, with the tracking number. Only the v1 shipment names a carrier.
- `shipment_delivered` → `delivered`.
- `order_failed`, `order_canceled` → `unfulfilled`.
- `shipment_returned` (v2) and `package_returned` (v1) → `shipped`, because there is no "returned" status. For an order already recorded as shipped this changes nothing.
- Everything else, including `order_created` and `order_updated` → `null`.

The update's `orderId` is the Printful order's `external_id` (the store's order id, set at submit) and `externalOrderId` is Printful's own order id.

Not verified live: the payload field names come from Printful's published docs (`test/webhook-fixtures.ts` lists the pages); no delivery from a real Printful account has been run through this code. The default verifier checks the v2 signature. Printful's v1 docs describe no signature, so v1 events need your own `verifyWebhookSignature`.

## Key exports

- `createPrintfulFulfillmentAdapter(config)`, `PRINTFUL_PROVIDER`, `PrintfulApiError`.
- `PrintfulCatalogTarget`: `{ catalogVariantId, retailPrice?, name?, placements? }`.
- `printfulOrderStatusUpdateFrom`, `printfulWebhookSignatureFrom`.
- `verifyPrintfulSignature`, `parsePrintfulWebhookPayload`, `PrintfulWebhookSignatureInvalidError`, `PrintfulWebhookSignatureUnconfirmedError`, `PrintfulWebhookPayloadParseError`.
- `mapRecipientToPrintfulAddress`.

See [docs/subsystems/22-fulfillment.md](../../docs/subsystems/22-fulfillment.md) and [integrations.md](../../apps/docs/content-src/integrations.md).

## Stored mappings and testing safely

`printfulCatalogTargetsFrom(repo)` builds `resolveCatalogTarget` from a `ProviderCatalogMappingRepository` (in `@mercatus-liber/fulfillment`, with durable versions in each database adapter). Set `holdOrders: true` to leave new orders as drafts in Printful instead of sending them to production. Use it for any test against a real account.

## Running a Printful catalog

`createPrintfulCatalogClient` reads Printful's catalog, prices, shipping rates, and webhook settings, and renders mockups. It never creates an order.

Describe each product as data with `PrintfulProductSpec` (blank, colors, sizes, print files, retail price), then:

```ts
const client = createPrintfulCatalogClient({ apiToken, storeId });
const [variants, prices] = await Promise.all([client.listVariants(spec.printfulProductId), client.getPrices(spec.printfulProductId)]);
const plan = planPrintfulProduct(spec, variants, prices); // every SKU with Printful's cost and your margin
await applyPrintfulProduct({ catalog, mappings, routing }, plan);
```

`applyPrintfulProduct` creates the product and SKUs, stores each SKU's Printful variant and print files, and routes it to Printful. Running it again creates nothing new and keeps prices changed in the admin, unless you pass `{ updatePrices: true }`.

Planned costs come from Printful's price list: a variant's price covers one print placement, and each additional placement adds its price. The price list can be higher than what Printful actually charges (a hoodie listed at 23.95 was estimated at 22.63 on 2026-11-06), so for exact costs call `estimateCosts`, which creates no order, and pass the results to `planPrintfulProduct` as its fourth argument. Shipping and tax are extra.

`submitOrder` refuses an address without a street line, city, country, or postal code before calling Printful. A draft left by `holdOrders` reports the status `"held"`.

## Browsing Printful's catalog

`createPrintfulCatalogClient` also reads the whole catalog, for an admin that lets someone choose
what to sell:

- `listCatalogProducts(query)` (one page, at most 100) and `listAllCatalogProducts(query)` (every
  page; the whole catalog, 575 products on 2026-11-20, is 6 requests). Filters: categories,
  colours, placements, techniques, selling region, destination country, sort.
- `listCategories()`, `getCatalogListing(id)` (colours, sizes, techniques, placements),
  `getVariant(id)`.
- `getPrintAreas(id)`: each placement's print area in inches and dpi, and the pixel size a print
  file should be (product 71's front: 12 x 16 in at 150 dpi, 1800 x 2400 px), with its mockup
  styles.
- `getMockupTemplates(id)`: template images with the print area's position on them, per group of
  variants; `templateFor(templates, variantId, placement)` picks one.
- `getAvailability(id)`: stock per variant, technique and selling region.

`createPrintfulCatalogCache({ fetch, load, save, ttlMs })` keeps the listing (default one day) so
browsing doesn't call Printful on every page view; it serves a saved copy without a token and a
stale copy when Printful fails. `filterPrintfulCatalog` searches a cached listing.
`printfulProductsInStore` says which Printful products a store already sells, from its mappings
(`applyPrintfulProduct` now records `catalogProductId`).

### Bringing products over, art, and publishing

- `applyPrintfulProduct` accepts a spec with no `files`: its SKUs are created as drafts, which can't be added to a cart. Print files are merged into what each SKU has (`mergePrintfulPlacements`), so running a plan again never loses art added later. `newSkuStatus` sets the status of new SKUs that do have art (default `"active"`, as before).
- `setPrintfulArt(deps, productId, files, { remove })` sets or replaces placements on every SKU; a SKU that loses its last file goes back to draft.
- `printfulReadiness(deps, productId)` lists what stops a product going on sale: SKUs not made by Printful, SKUs without art, SKUs priced at or below Printful's cost with their current placements (re-checked with `getPrices`), and a product with no image. `publishPrintfulProduct` publishes only when that list is empty, making draft SKUs active; otherwise it throws `PrintfulProductNotReadyError` and changes nothing.
- The fulfillment adapter refuses an order item whose SKU has no print file (`PrintfulMissingArtError`) before calling Printful.
- `printfulMockupRequest(deps, skuIds)` builds a mockup request from the SKUs' variants and art; `printfulMockupImages(tasks)` lists the finished images. Mockups need `storeId` with an account-level token. Printful's mockup URLs are temporary ("Temporary URL to generated mockup image" in its v2 spec; they sit under `/tmp/`), so copy them before keeping them (`copyImageToMediaStore` in `@mercatus-liber/media`).

Both clients wait out a short `429 Retry-After` once and otherwise throw
`PrintfulRateLimitError` (v2 allows 120 requests a minute).

## States

For the US, Canada, Australia, Brazil and Japan, Printful wants `state_code` as a code. The
adapter converts a name ("Nebraska" becomes `NE`) and throws `UnresolvedRegionError` from
`@mercatus-liber/core` before calling Printful when it can't. See `normalizePrintfulRecipient`.

## Order ids and Printful's 32-character limit

Printful refuses an order whose `external_id` is longer than 32 characters. A real `POST /v2/orders` with a 36-character UUID was answered with HTTP 400, "Maximum external_id string length is 32". So the adapter sends a UUID order id without its dashes (`printfulExternalIdFor`) and reads it back with them (`orderIdFromPrintfulExternalId`), in `submitOrder`, `getOrderStatus` and `printfulOrderStatusUpdateFrom`. Ids of 32 characters or fewer are sent unchanged. A longer id that is not a UUID throws `PrintfulExternalIdTooLongError` before anything is sent.
