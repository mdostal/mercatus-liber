# @mercatus-liber/store-api

An authenticated HTTP API for outside apps to read a store's catalog, run its promotions, and subscribe to its events. It's one fetch-style handler (`Request` in, `Response` out), so it mounts in Next.js or any server.

**Status:** tested; mounted in the reference storefront for the demo stores. Not yet published to npm.

```ts
import { createStoreApiHandler, createStoreApiKey } from "@mercatus-liber/store-api";

const handler = createStoreApiHandler({ deps, keys, basePath: "/api/store/v1" });
// Next.js: app/api/store/v1/[...path]/route.ts -> export const GET = handler, POST = handler, ...

const { secret } = await createStoreApiKey(keys, { name: "flayr", scopes: ["products:read", "promotions:read"] });
```

Keys are stored as SHA-256 hashes, and each has scopes: `products:read`, `promotions:read`, `promotions:write`, `webhooks:manage`. Endpoints, payloads, and how flayr uses them: [docs/integrations/flayr.md](../../docs/integrations/flayr.md). Outside apps should use `@mercatus-liber/store-client`.

New promotions created through the API start inactive unless the caller sets `status: "active"`. A variant shows `salePrice` only for a live, automatic (codeless) product promotion, since that's the price a shopper actually sees.

**One gap to know about:** checkout applies only the single best automatic promotion to a cart, while `salePrice` shows the best one for each variant. With two automatic product promotions on different products, a cart holding both gets only one, so one of the shown sale prices won't apply at checkout. Run one automatic sale at a time until checkout stacks them.

