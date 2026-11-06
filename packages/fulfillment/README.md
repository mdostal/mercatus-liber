# @mercatus-liber/fulfillment

Routes each order line to a fulfillment provider and tracks its status. Providers plug in as `FulfillmentAdapter`s; a manual adapter is built in and always available.

**Status:** used by the demo stores. The manual adapter is always registered. The Printful and Printify adapters are credential-gated and unverified against the live providers. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  createFulfillmentService,
  createInMemoryFulfillmentRoutingRepository,
  createManualFulfillmentAdapter,
  MANUAL_FULFILLMENT_PROVIDER,
} from "@mercatus-liber/fulfillment";

const fulfillment = createFulfillmentService({
  orders,
  routing: createInMemoryFulfillmentRoutingRepository(),
  adapters: { [MANUAL_FULFILLMENT_PROVIDER]: createManualFulfillmentAdapter() },
});

await fulfillment.submitOrder("order-1");
const lines = await fulfillment.listForOrder("order-1");
```

## Key exports

- `createFulfillmentService(deps)`: `listForOrder`, `submitOrder`, `markLineShipped`.
- `createManualFulfillmentAdapter()`, `MANUAL_FULFILLMENT_PROVIDER`.
- `createInMemoryFulfillmentRoutingRepository()`, `FulfillmentRoutingRepository`.
- `OrderNotFoundForFulfillmentError`, `NoAdapterForProviderError`, `ManualStatusUpdateNotSupportedError`, `FulfillmentLineNotFoundError`.

## Implementing an adapter

Implement `FulfillmentAdapter`: `submitOrder`, `getOrderStatus`, and optionally `handleWebhookEvent`. Register it in `adapters` under a provider key. `packages/adapter-printify` and `packages/adapter-printful` are full examples.

See [docs/subsystems/22-fulfillment.md](../../docs/subsystems/22-fulfillment.md).
