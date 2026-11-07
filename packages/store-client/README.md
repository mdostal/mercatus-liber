# @mercatus-liber/store-client

A typed client for a Mercatus Liber store's API (`@mercatus-liber/store-api`), plus a webhook signature check. It has no dependencies and runs anywhere `fetch` and Web Crypto do, so an outside app such as flayr can use it without the rest of the framework.

**Status:** tested against the real handler in memory. Not yet published to npm.

```ts
import { createMercatusStoreClient, verifyMercatusWebhook, MERCATUS_SIGNATURE_HEADER } from "@mercatus-liber/store-client";

const store = createMercatusStoreClient({ baseUrl: "https://shop.example/api/store/v1", apiKey });
const products = await store.listAllProducts();
const promo = await store.createPromotion({ code: "HOLIDAY20", kind: "percentage", value: 20, startsAt, endsAt }); // inactive until turned on

// In a webhook route, before parsing the body:
const ok = await verifyMercatusWebhook(rawBody, request.headers.get(MERCATUS_SIGNATURE_HEADER), secret);
```

See [docs/integrations/flayr.md](../../docs/integrations/flayr.md).
