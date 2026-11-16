# @mercatus-liber/adapter-printful

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that submits orders to Printful.

**Status:** built and tested, credential-gated, and never called against a live Printful account, so it is unverified against the live provider. Enabled by `PRINTFUL_API_TOKEN`, with optional `PRINTFUL_STORE_ID`. Not yet published to npm; use it from this monorepo via `workspace:*`.

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

