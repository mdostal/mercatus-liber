# @mercatus-liber/adapter-shippo

A `ShippingAdapter` for `@mercatus-liber/shipping` that gets rates, buys labels, and tracks shipments through Shippo.

**Status:** built and tested, credential-gated, and never called against a live Shippo account, so it is unverified against the live provider. Enabled by `SHIPPO_API_TOKEN`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createShippoShippingAdapter } from "@mercatus-liber/adapter-shippo";

const shipping = createShippoShippingAdapter({
  apiToken: process.env.SHIPPO_API_TOKEN!,
});

const rates = await shipping.getRates(input);
```

`baseUrl`, `fetchImpl`, `httpClient`, and `labelFileType` are optional config.

## Key exports

- `createShippoShippingAdapter(config)`, `ShippoShippingAdapterConfig`.
- `SHIPPO_DASHBOARD_URL`.
- `ShippoApiError`, `ShippoHttpClient`, `ShippoHttpClientConfig`.
- Address and rate mapping helpers such as `toShippoAddress`.

See [docs/subsystems/23-shipping.md](../../docs/subsystems/23-shipping.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
