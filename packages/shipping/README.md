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

## Labels for orders you ship yourself

`createOrderLabelService` buys a label for an order the store ships itself (stock it holds, or a print from its own printer) and writes the tracking number onto those order lines.

```ts
import { createOrderLabelService } from "@mercatus-liber/shipping";

const labels = createOrderLabelService({
  adapter: shipping.shippo,          // any ShippingAdapter
  fromAddress: storeAddress,
  orders: orderLookup,               // fulfillment's OrderLookup fits
  recorder: fulfillmentService,      // anything with markLineShipped(orderId, skuId, tracking)
});

const quote = await labels.quote(orderId, { weightOz: 8 });
if (quote.available) {
  const bought = await labels.buy(orderId, ["sunglasses-blue"], quote.rates[0].rateId);
}
await labels.void(labelId);          // unused label; adapters without voidLabel say so
```

- `quote` refuses an order without a complete structured address (name, street, city, state, postal code, country) and names what is missing. It never parses the free-text address.
- If writing the tracking fails before any line is recorded, `buy` voids the label and throws `LabelRecordedPartiallyError`. If some lines were already recorded, it keeps the label and the error lists those lines.
- Nothing is stored here: the label URL comes back to the caller, and the tracking lives on the fulfillment lines.

### Announcing the shipment

The recorder can have two optional hooks: `labelRecorded({ orderId, skuIds, label })`, called once per bought label after every line is marked, and `labelVoided(labelId)`, called after the provider accepted a void. Point them at `@mercatus-liber/fulfillment` to publish `fulfillment.order.status_changed` for self-shipped lines, the same event a print provider's webhook produces:

```ts
import { recordSelfShipment, recordSelfShipmentVoided } from "@mercatus-liber/fulfillment";

recorder: {
  markLineShipped: (orderId, skuId, tracking) => fulfillmentService.markLineShipped(orderId, skuId, tracking),
  labelRecorded: ({ orderId, skuIds, label }) =>
    recordSelfShipment({ links, recorder: statusRecorder, orderId, skuIds, trackingNumber: label.trackingNumber, trackingUrl: label.trackingUrl, carrier: label.carrier, labelId: label.labelId }),
  labelVoided: (labelId) => recordSelfShipmentVoided({ recorder: statusRecorder, labelId }),
},
```

A hook that throws does not fail the call: the label is already bought (or voided). `buy` returns `purchased: true` with `labelRecordedError` set, and `void` returns `voided: true` with `labelVoidedError` set, so check those fields. This package does not depend on fulfillment; the hooks are plain functions.

## Key exports

- `ShippingAdapter`: `getRates`, `buyLabel`, `getTrackingStatus`, and optional `voidLabel`.
- `createOrderLabelService`, `orderShipToAddress`, `LabelRecordedPartiallyError`.
- `createManualShippingAdapter()`, `PIRATESHIP_URL`, `detectCarrierFromTrackingNumber`.
- `RateQuoteResult`, `LabelPurchaseResult`, `LabelVoidResult`.

## Implementing an adapter

Implement `ShippingAdapter`. `packages/adapter-shippo` is a complete example.

See [docs/subsystems/23-shipping.md](../../docs/subsystems/23-shipping.md).
