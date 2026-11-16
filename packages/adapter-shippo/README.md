# @mercatus-liber/adapter-shippo

A `ShippingAdapter` for `@mercatus-liber/shipping` that gets rates, buys labels, and tracks shipments through Shippo.

**Status:** rates, buying a label and voiding it were run against Shippo's real API with a test token on 2026-11-16 (USPS Ground Advantage, San Francisco to San Francisco). No label has been bought with a live token, and the tracking webhook mapper has not received a real delivery. See "What the test-mode run showed" below. Enabled by `SHIPPO_API_TOKEN`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createShippoShippingAdapter } from "@mercatus-liber/adapter-shippo";

const shipping = createShippoShippingAdapter({
  apiToken: process.env.SHIPPO_API_TOKEN!,
});

const rates = await shipping.getRates(input);
const bought = await shipping.buyLabel(rates.rates[0].rateId); // label.labelId is the Shippo transaction id
await shipping.voidLabel(bought.label.labelId);                 // POST /refunds; Shippo may settle it later
```

`baseUrl`, `fetchImpl`, `httpClient`, and `labelFileType` are optional config.

**Parcels need a box size.** `getRates` refuses a parcel without all three of `lengthIn`, `widthIn` and `heightIn` (it throws before calling Shippo), because Shippo quotes on dimensions and this adapter won't invent them. Collect the box as well as the weight.

## Tracking webhooks

`shippoTrackingUpdateFrom(body)` maps a Shippo `track_updated` webhook body (raw string, Buffer or parsed JSON) to a status update for a parcel the store shipped itself, or `null`. Pass the result to `@mercatus-liber/fulfillment`'s status recorder under the `"manual"` provider:

```ts
const update = shippoTrackingUpdateFrom(rawBody);
if (update) {
  const outcome = await recorder.record("manual", update);
  // A shipment recorded without a label id is linked by its tracking number.
  if (outcome === "unlinked") await recorder.record("manual", { ...update, externalOrderId: update.trackingNumber });
}
```

- `DELIVERED` → `delivered`. `TRANSIT`, `RETURNED`, `FAILURE` → `shipped` (no change for a parcel already recorded as shipped). `PRE_TRANSIT`, `UNKNOWN` and other events → `null`.
- The update is keyed by the body's `transaction` id, which is the `labelId` this adapter returns from `buyLabel` and the id fulfillment's `recordSelfShipment` links the parcel under. Without one it falls back to the tracking number.
- `carrier` is always `null`, so the carrier name stored at purchase is kept.

**This package gives you the mapper only. You must protect the endpoint yourself.** Shippo does not sign webhooks by default, so an unprotected route lets anyone mark an order delivered. Shippo's docs (docs.goshippo.com/docs/tracking/webhooksecurity/) give three options, which can be combined:

1. Put a long random token in the webhook URL (`?token=...`) and reject any request without it, comparing in constant time.
2. Accept requests only from Shippo's published IP addresses.
3. Ask Shippo to enable HMAC signing for the account (their docs say this can take up to 10 business days), then verify the signature header: `t=<timestamp>,v1=<signature>`, an HMAC-SHA256 of `<timestamp>.<raw body>`. This package has no verifier for it, because it could not be tested against a real signed delivery.

Not verified live: the body shape is from Shippo's published docs (`test/webhook-fixtures.ts` lists the pages). The docs show `transaction` only as a placeholder, so whether it is filled in for labels bought through the API is not confirmed.

## Key exports

- `shippoTrackingUpdateFrom(body)`, `ShippoTrackingUpdate`, `ShippoWebhookPayloadParseError`.

- `createShippoShippingAdapter(config)`, `ShippoShippingAdapterConfig`.
- `SHIPPO_DASHBOARD_URL`.
- `ShippoApiError`, `ShippoHttpClient`, `ShippoHttpClientConfig`.
- Address and rate mapping helpers such as `toShippoAddress`.

See [docs/subsystems/23-shipping.md](../../docs/subsystems/23-shipping.md) and [integrations.md](../../apps/docs/content-src/integrations.md).

## What the test-mode run showed

Three things in Shippo's real behaviour differed from its reference pages. All three are handled now.

- **The sender needs an email for USPS.** Without one the purchase fails: `Attribute "address_from.email" must not be empty`. Set `email` on the ship-from `ShippingAddress`.
- **A bought label's `rate` is an id, not an object.** `POST /transactions/` answers with the rate's id as a string, so the carrier is not in the response. The adapter takes it from the rates it quoted, then from `GET /rates/{id}`, and returns the label even if neither names one (`carrier: "unknown"`). It used to throw at this point, after the label was already bought.
- **A test token cannot track real carriers.** `GET /tracks/usps/...` answers HTTP 400 (`usps is not a valid test tracking carrier. Please use 'shippo'`). `getTrackingStatus` reports `unknown` for a refusal like that instead of throwing.

Also seen: a carrier that is not activated in the Shippo account still returns rates, and fails only at purchase (`The UPS account is not yet registered`). `buyLabel` reports that as `purchased: false` with Shippo's message. A tracking record does carry a `transaction` field, which is what `shippoTrackingUpdateFrom` keys on; whether a real carrier's `track_updated` webhook fills it for an API-bought label is still unconfirmed.
