# @mercatus-liber/adapter-printify

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that submits orders to Printify.

**Status:** built and tested, credential-gated, and never called against a live Printify account, so it is unverified against the live provider. Enabled by `PRINTIFY_API_TOKEN` and `PRINTIFY_SHOP_ID`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createPrintifyFulfillmentAdapter, PRINTIFY_PROVIDER } from "@mercatus-liber/adapter-printify";

const printify = createPrintifyFulfillmentAdapter({
  apiToken: process.env.PRINTIFY_API_TOKEN!,
  shopId: process.env.PRINTIFY_SHOP_ID!,
  resolveRecipient: async (orderId) => loadRecipient(orderId),
  resolveCatalogTarget: async (skuId) => loadPrintifyTarget(skuId),
  resolveExternalOrderId: async (orderId) => orderId,
});

// Register it with the service under its provider key:
const adapters = { [PRINTIFY_PROVIDER]: printify };
```

You supply three callbacks. `resolveCatalogTarget` maps your SKU to a `PrintifyCatalogTarget`, which is required because Printify orders reference its own product and variant ids. `shopId` is required because an account can have several shops and the adapter does not discover them.

## Webhooks

Set `webhookSecret` to verify incoming webhooks, or `verifyWebhookSignature` to replace the verifier, and `onWebhookEvent` to receive parsed events.

## Key exports

- `createPrintifyFulfillmentAdapter(config)`, `PRINTIFY_PROVIDER`, `PrintifyApiError`, `DEFAULT_PRINTIFY_USER_AGENT`.
- `PrintifyCatalogTarget`: `{ productId, variantId }`.
- `verifyPrintifySignature`, `parsePrintifyWebhookPayload`, `PrintifyWebhookEvent`, `PrintifyWebhookSignatureInvalidError`, `PrintifyWebhookSignatureNotConfiguredError`, `PrintifyWebhookPayloadParseError`.

See [docs/subsystems/22-fulfillment.md](../../docs/subsystems/22-fulfillment.md) and [integrations.md](../../apps/docs/content-src/integrations.md).

## Stored mappings and testing safely

`printifyCatalogTargetsFrom(repo)` builds `resolveCatalogTarget` from a `ProviderCatalogMappingRepository` (in `@mercatus-liber/fulfillment`, with durable versions in each database adapter). Set `holdOrders: true` to leave new orders on hold in Printify instead of sending them to production. Use it for any test against a real account.

