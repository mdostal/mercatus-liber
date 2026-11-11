# @mercatus-liber/adapter-slant3d

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that has [Slant 3D](https://slant3dapi.com) print and ship orders. Slant is a 3D print farm: you upload a model file once, and each order names that file, a filament (material and colour) and a quantity.

**Status:** built from Slant's published OpenAPI file and docs site as read on 2026-11-10, and tested against a fake `fetch`. It has never been run against a live Slant account. Not published to npm; use it from this monorepo via `workspace:*`.

## What it does

- **Orders.** `submitOrder` drafts the order at Slant, then processes it. Processing is the step that charges the payment method and queues the order for printing. With `holdOrders: true` it stops after the draft and reports the lines as `held`.
- **Status.** `getOrderStatus` reads the order back from Slant and reports each line's status and tracking number.
- **Webhooks.** `handleWebhookEvent` checks Slant's signature and the timestamp's age, then hands the parsed event to `onWebhookEvent`.
- **Setup and pricing.** `createSlant3dCatalogClient` lists filaments, uploads model files, prices a file in whole cents, and manages the platform's webhook URL and secret.
- **Products as data.** `planSlant3dProduct` and `applySlant3dProduct` turn "this file, in these filaments, at these prices" into SKUs, mappings and routing, with each SKU's cost and margin.

## Setup

1. **Get an API key.** Create one in your Slant account. It starts with `sl-`. An account can hold 3 keys.
2. **Add a payment method to the Slant account.** Slant's docs say a draft needs one connected, and processing an order charges it.
3. **Create a platform**, or use one you already have. A platform is Slant's grouping for files, orders and webhooks, and its id goes on most requests. An account can have 5 enabled platforms.

   ```ts
   import { createSlant3dCatalogClient } from "@mercatus-liber/adapter-slant3d";

   const setup = createSlant3dCatalogClient({ apiKey: process.env.SLANT3D_API_KEY! });
   const platform = await setup.createPlatform({ name: "My store", url: "https://store.example" });
   // Keep platform.id as SLANT3D_PLATFORM_ID.
   ```

4. **Upload each model file** and keep the id that comes back.

   ```ts
   const slant = createSlant3dCatalogClient({ apiKey: process.env.SLANT3D_API_KEY!, platformId: process.env.SLANT3D_PLATFORM_ID! });
   const file = await slant.uploadFile({ name: "ducky", bytes: await readFile("ducky.stl") });
   // file.publicFileServiceId is the file id.
   ```

5. **Map each SKU** to a file and a filament. Pick filaments from `slant.listFilaments()`. Either save mappings yourself:

   ```ts
   await mappings.save({ skuId, provider: SLANT3D_PROVIDER, target: { fileId, filamentId } });
   ```

   or describe the product and let the helpers create the SKUs, mappings and routing:

   ```ts
   const spec = { slug: "ducky", title: "Ducky", description: "A duck.", fileId, variants: [{ filamentId, retailCents: 1500 }] };
   const costs = await estimateSlant3dUnitCosts(slant, fileId, spec.variants.map((v) => v.filamentId));
   const plan = planSlant3dProduct(spec, await slant.listFilaments(), costs);
   // Check plan.skus[].marginCents and plan.unavailable, then:
   await applySlant3dProduct({ catalog, mappings, routing }, plan);
   ```

6. **Set the webhook URL and read the secret.**

   ```ts
   await slant.setWebhookUrl("https://store.example/webhooks/slant3d");
   const secret = await slant.getWebhookSecret(); // keep as SLANT3D_WEBHOOK_SECRET
   await slant.sendTestWebhook(); // sends a signed test event to that URL
   ```

   Slant requires the URL to be a reachable HTTPS endpoint. `rotateWebhookSecret()` and `setWebhookSecret()` replace the secret at once, with no overlap, so update the adapter's secret at the same time.

7. **Create the adapter** and register it under its provider key.

   ```ts
   import { createSlant3dFulfillmentAdapter, slant3dCatalogTargetsFrom, slant3dWebhookSignatureFrom, SLANT3D_PROVIDER } from "@mercatus-liber/adapter-slant3d";

   const slant3d = createSlant3dFulfillmentAdapter({
     apiKey: process.env.SLANT3D_API_KEY!,
     platformId: process.env.SLANT3D_PLATFORM_ID!,
     webhookSecret: process.env.SLANT3D_WEBHOOK_SECRET,
     resolveCatalogTarget: slant3dCatalogTargetsFrom(mappings),
     resolveExternalOrderId: async (orderId) => loadSlantOrderId(orderId),
     onWebhookEvent: async (event) => {
       if (event.dummy || !event.order) return;
       // event.type is e.g. "order.shipped"; event.order has publicId, status and trackingNumber.
     },
   });

   const adapters = { [SLANT3D_PROVIDER]: slant3d };
   ```

8. **Route the webhook.** Slant signs with two headers, and `handleWebhookEvent` takes one signature string, so join them with the helper. Pass the raw request body, not re-serialized JSON.

   ```ts
   await slant3d.handleWebhookEvent(rawBody, slant3dWebhookSignatureFrom(request.headers));
   ```

## Options

The environment variable names above are only suggestions; the package reads no environment variables itself.

| Option | Required | What it is |
| --- | --- | --- |
| `apiKey` | yes | Slant API key, sent as a Bearer token. |
| `platformId` | yes | The Slant platform orders are created under. |
| `resolveCatalogTarget(skuId)` | yes | Returns `{ fileId, filamentId }` for a SKU. `slant3dCatalogTargetsFrom(repo)` builds one from a `ProviderCatalogMappingRepository`. |
| `resolveExternalOrderId(orderId)` | no | Returns the Slant order id for an order (the `externalOrderId` on the records `submitOrder` returned). Slant has no lookup by your own order id, so `getOrderStatus` needs this. Without it the adapter only knows orders the running process submitted. |
| `resolveRecipient(orderId)` | no | Loads the address when an order arrives without one. |
| `holdOrders` | no | `true` leaves new orders as Slant drafts. Nothing is charged or printed. Use it for any test against a real account. Default `false`. |
| `webhookSecret` | no | The platform's webhook secret. Without it or `verifyWebhookSignature`, every webhook is refused. |
| `webhookToleranceMs` | no | How old a webhook's timestamp may be. Default 5 minutes. |
| `verifyWebhookSignature` | no | Replaces the built-in check. |
| `onWebhookEvent(event)` | no | Receives each verified event. |
| `baseUrl`, `fetchImpl`, `httpClient`, `now` | no | For tests and unusual setups. |

The adapter also has `processHeldOrder(publicOrderId)`, to process a held draft, and `cancelOrder(publicOrderId)`.

## Behaviour to know about

- **Address.** An order is refused before anything is sent to Slant if the recipient lacks a name, email, street, city, state, postal code or country. The error is `IncompleteRecipientError` and lists what is missing.
- **Status mapping.** `DRAFT` is `held`. `SUBMITTED` and `PRINTING` are `submitted`. `SHIPPED` is `shipped`. `CANCELLED` is `unfulfilled`. Nothing is reported as `delivered`: Slant's order status ends at `SHIPPED`.
- **Tracking.** Status and tracking are per order at Slant, so every line of an order reports the same ones. Slant gives tracking numbers but no tracking URL, so `trackingUrl` is always `null`. If an order has several tracking numbers, the first is reported.
- **Failed processing.** If the draft is created but processing fails (a declined card, say), `submitOrder` throws `Slant3dOrderProcessError` with the draft's `publicOrderId`. The draft stays at Slant. Submitting again creates a second draft, so process or cancel the first one by its id instead.
- **Webhook signature.** The signature is the hex HMAC-SHA256 of `<X-Webhook-Timestamp>.<raw body>` keyed with the platform's webhook secret, sent as `X-Webhook-Signature-256: sha256=<hex>`. A webhook is refused if the signature doesn't match or the timestamp is 5 minutes old or more. This is the scheme in the "Webhook Signature Verification" section of Slant's docs.
- **Webhook retries.** Slant retries a failed delivery once a minute for up to 10 attempts on a timeout, a 5xx, a 408 or a 429. Any other 4xx is stored without retrying and has to be resent by hand within 30 days. Slant's docs don't say whether a resend carries a new timestamp. If it doesn't, a resend older than the tolerance is refused; raise `webhookToleranceMs` while replaying.
- **Money.** Slant charges in US dollars. `estimate` and `slant3dUsdToCents` return whole cents and don't use float arithmetic.
- **Rate limit.** Slant allows 100 requests a minute. The package doesn't throttle or retry.

## Limits on Slant's side

- Parts can be at most 220 mm in each dimension, and files at most 250 MB.
- Slant's API spec lists STL as the only file type. Its docs page says STL, OBJ and 3MF. Use STL unless you have confirmed otherwise with Slant.
- Filaments are PLA, PETG and "OPM" in the colours `listFilaments` returns. A filament can go out of stock.
- Whether supports are printed is decided by Slant when the file is uploaded and affects the price. It can't be set per order.
- Cancelling an order refunds it. Slant's docs say an order that has already shipped is refunded but not recalled.

## Not covered

- Shipping cost before an order exists. Slant only prices delivery on a drafted order, so `estimate` and the product margins are print cost only.
- Slant's other order item types (components such as magnets or inserts, and printed cards), slicer options, and requested arrival dates.
- Charging a shopper's own card through Slant (`publicPaymentServiceId`, Slant's customer and checkout endpoints). Orders are charged to the Slant account's payment method.
- Listing or searching Slant orders, deleting files, API key management, usage statistics, OpenSCAD conversion, and listing or resending stored webhooks.
- Storing the Slant order id for you. Persist `externalOrderId` from `submitOrder` and return it from `resolveExternalOrderId`.
- Acting on webhooks. The adapter verifies and parses them; updating your own records is up to `onWebhookEvent`.

## Key exports

- `createSlant3dFulfillmentAdapter(config)`, `slant3dCatalogTargetsFrom(repo)`, `SLANT3D_PROVIDER`, `Slant3dOrderProcessError`.
- `createSlant3dCatalogClient(config)`, `InvalidSlant3dWebhookSecretError`.
- `planSlant3dProduct`, `applySlant3dProduct`, `estimateSlant3dUnitCosts`.
- `createSlant3dHttpClient(config)`, `Slant3dApiError` (carries `status` and `slantMessage`).
- `slant3dWebhookSignatureFrom`, `verifySlant3dWebhook`, `verifySlant3dSignature`, `parseSlant3dWebhookPayload`, and the three webhook error classes.
- `mapSlant3dOrderStatus`, `mapRecipientToSlant3d`, `assertShippableRecipient`, `IncompleteRecipientError`, `buildSlant3dLineRecords`, `slant3dUsdToCents`.
