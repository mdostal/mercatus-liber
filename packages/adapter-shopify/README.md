# @mercatus-liber/adapter-shopify

A `CatalogPersistenceAdapter` backed by the Shopify Admin GraphQL API, which lets the catalog service read from and write to an existing Shopify store.

**Status:** built and tested, but not wired into the demo stores, and unverified against a live Shopify store. It is reachable through the store scaffolder with `create-store --adapter shopify`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createCatalogService } from "@mercatus-liber/catalog";
import { createShopifyAdapter } from "@mercatus-liber/adapter-shopify";

const persistence = createShopifyAdapter({
  shop: "my-store.myshopify.com",
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
});

const catalog = createCatalogService({ persistence, events, catalogs, productCatalogs });
```

`apiVersion`, `fetchImpl`, and `currency` are optional config. The `SHOPIFY_ACCESS_TOKEN` name above is only an example; the package reads no environment variables.

## Key exports

- `createShopifyAdapter(config)`: returns a `CatalogPersistenceAdapter`.
- `createGraphQLClient`: the underlying client.
- `productNodeToProduct`, `variantNodeToSku`: Shopify-to-core mapping.
- `EXTERNAL_ID_KEY`, `EXTERNAL_ID_NAMESPACE`.
- `ProductNotFoundInShopifyError`, `ShopifyGraphQLError`.

See [docs/subsystems/00-core-schema.md](../../docs/subsystems/00-core-schema.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
