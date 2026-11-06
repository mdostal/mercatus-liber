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

Set `webhookSecretKeyHex` to verify incoming webhooks, or `verifyWebhookSignature` to replace the verifier, and `onWebhookEvent` to receive parsed events.

## Key exports

- `createPrintfulFulfillmentAdapter(config)`, `PRINTFUL_PROVIDER`, `PrintfulApiError`.
- `PrintfulCatalogTarget`: `{ catalogVariantId, retailPrice?, name?, placements? }`.
- `verifyPrintfulSignature`, `parsePrintfulWebhookPayload`, `PrintfulWebhookSignatureInvalidError`, `PrintfulWebhookSignatureUnconfirmedError`, `PrintfulWebhookPayloadParseError`.
- `mapRecipientToPrintfulAddress`.

See [docs/subsystems/22-fulfillment.md](../../docs/subsystems/22-fulfillment.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
