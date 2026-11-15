# @mercatus-liber/adapter-shipstation

A `ShippingAdapter` for `@mercatus-liber/shipping` that gets rates, buys labels, voids labels, and tracks labels through ShipStation API v2 (`https://api.shipstation.com/v2`).

**Status:** built from the published docs, tested against fakes, never called against a live ShipStation account. Enabled by `SHIPSTATION_API_KEY`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createShipStationShippingAdapter } from "@mercatus-liber/adapter-shipstation";

const shipping = createShipStationShippingAdapter({
  apiKey: process.env.SHIPSTATION_API_KEY!,
});

const quote = await shipping.getRates(input);
if (quote.available) {
  const bought = await shipping.buyLabel(quote.rates[0].rateId);
  if (bought.purchased) await shipping.voidLabel(bought.label.labelId!);
}
```

Optional config: `baseUrl`, `fetchImpl`, `httpClient`, `labelFormat` (`"pdf"` default, also `"png"` or `"zpl"`), `carrierIds`, and `instructionsUrl`. The key is sent only in the `API-Key` header. It never appears in logs or error messages.

## What each method does

| Method | Endpoint | Notes |
| --- | --- | --- |
| `getRates(input)` | `POST /v2/rates` | Sends an inline shipment. ShipStation requires `rate_options.carrier_ids`. Pass `carrierIds`, or the adapter lists them with `GET /v2/carriers` on each call and skips carriers that are `disabled_by_billing_plan` or have `send_rates: false`. The total price is shipping + insurance + confirmation + other amounts, as the rate-shopping guide describes. Zero rates, zero carriers, or an HTTP 400/404 return `{ available: false, reason, instructionsUrl }`. |
| `buyLabel(rateId)` | `POST /v2/labels/rates/{rate_id}` | Only `status: "completed"` counts as purchased. Sets `labelId` from ShipStation's `label_id`. `processing`, `error`, or an HTTP 400/404 (for example `insufficient_funds`) return `purchased: false`. |
| `voidLabel(labelId)` | `PUT /v2/labels/{label_id}/void` | `approved: true` returns `{ voided: true, pending: true }`. The void guide says the refund is usually instant but can take up to 28 days, and the response doesn't say which applies. `approved: false` or HTTP 400/404 returns `{ voided: false, reason }` with the carrier message and `reason_code`. |
| `getTrackingStatus(trackingNumber)` | none | Always `status: "unknown"`, plus a carrier tracking link when the number's format is recognized. See the limitation below. |
| `getTrackingStatusForLabel(labelId)` | `GET /v2/labels/{label_id}/track` | A live tracking lookup by ShipStation label id. This method is extra; `ShippingAdapter` has no slot for it. |

HTTP 401, 403, 429 and 5xx responses throw `ShipStationApiError`, which carries the status, ShipStation's `request_id` and its error messages.

## Limitations

- **Tracking by bare number:** v2 tracks a number with `GET /v2/tracking?carrier_code=...&tracking_number=...`. `ShippingAdapter.getTrackingStatus` only gets the number, and that endpoint's access table lists only the ShipStation API Advanced and Enterprise plans. Rather than guess a carrier, this adapter returns `"unknown"` for a bare number. Use `getTrackingStatusForLabel(label.labelId)` for labels bought through it.
- **Phone is required:** the spec marks `phone` as required on `ship_to` and `ship_from`. `getRates` throws if either address has no phone, rather than sending a fake one.
- **Residential flag:** `address_residential_indicator` is sent as `"unknown"`, the spec's default, because `ShippingAddress` has no such field.
- **Tracking mapping:** status codes map as `AC`/`IT`/`NY` to `in_transit`, `DE`/`SP` to `delivered`, `EX`/`AT` to `exception`, and `UN` to `unknown`. Treating `AT` (delivery attempt) as `exception` is this adapter's own choice; the docs give no equivalent.
- **Currency:** amounts are converted to minor units assuming two decimal places, the same as `adapter-shippo`.

## Plans and pricing

ShipStation's API is not on its free tiers:

- **ShipStation (the shipping app):** API access needs the Standard plan (from $29.99/month) or Premium (from $349.99/month). The Free and Starter plans "do not include API access". Every plan has a 30-day free trial. ([pricing](https://www.shipstation.com/pricing/), [Free/Starter plan docs](https://docs.shipstation.com/plans/shipstation-free-starter.md))
- **ShipStation API (formerly ShipEngine), a separate developer product:** has a $0 Free plan whose endpoint list covers the rates, labels and void calls above, and it offers `TEST_` sandbox keys. Tracking by number (`GET /v2/tracking`) needs Advanced ($75/month) or Enterprise. ([Shipping API pricing](https://www.shipstation.com/shipping-api/pricing/), [products and plans](https://docs.shipstation.com/products-and-plans.md))

Prices were checked on 2026-11-15 and may change.

## Sources

Every endpoint, field name and status value comes from these pages, fetched on 2026-11-15:

- OpenAPI spec, ShipStation API v2 2.0.0: https://docs.shipstation.com/_bundle/apis/@shipstation-v2/openapi.json
- Base URL and keys: https://docs.shipstation.com/getting-started
- `API-Key` header and sandbox keys: https://docs.shipstation.com/authentication
- Rates (`POST /v2/rates`, `carrier_ids`, total price): https://docs.shipstation.com/rate-shopping and https://docs.shipstation.com/openapi/rates
- Labels from a rate (`POST /v2/labels/rates/{rate_id}`, `label_download`): https://docs.shipstation.com/create-labels and https://docs.shipstation.com/openapi/labels
- Void (`PUT /v2/labels/{label_id}/void`, refunds): https://docs.shipstation.com/void-labels
- Tracking (`GET /v2/labels/{label_id}/track`, status codes) and `GET /v2/tracking`: https://docs.shipstation.com/tracking
- Carriers (`GET /v2/carriers`): https://docs.shipstation.com/openapi/carriers
- Plan access per endpoint: https://docs.shipstation.com/products-and-plans.md, https://docs.shipstation.com/plans/shipstation-api-free.md, https://docs.shipstation.com/plans/shipstation-standard-premium.md
- Pricing: https://www.shipstation.com/pricing/ and https://www.shipstation.com/shipping-api/pricing/

See [docs/subsystems/23-shipping.md](../../docs/subsystems/23-shipping.md) for the shipping subsystem.
