# @mercatus-liber/shipping

The shipping adapter contract for rates, labels, and tracking, plus a manual adapter that reports honestly when rates and labels are unavailable.

**Status:** used by the demo stores. The manual adapter is always registered; `@mercatus-liber/adapter-shippo` is credential-gated and unverified. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createManualShippingAdapter, detectCarrierFromTrackingNumber, PIRATESHIP_URL } from "@mercatus-liber/shipping";

const shipping = createManualShippingAdapter();

const carrier = detectCarrierFromTrackingNumber("1Z999AA10123456784");
console.log(carrier, PIRATESHIP_URL);
```

`getRates` and `buyLabel` return result types rather than throwing, so a UI can show "not available" and link out to buy a label by hand.

## Key exports

- `ShippingAdapter`: `getRates`, `buyLabel`, `getTrackingStatus`.
- `createManualShippingAdapter()`, `PIRATESHIP_URL`, `detectCarrierFromTrackingNumber`.
- `RateQuoteResult`, `LabelPurchaseResult`.

## Implementing an adapter

Implement `ShippingAdapter`. `packages/adapter-shippo` is a complete example.

See [docs/subsystems/23-shipping.md](../../docs/subsystems/23-shipping.md).
