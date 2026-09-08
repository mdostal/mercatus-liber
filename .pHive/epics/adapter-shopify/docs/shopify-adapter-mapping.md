# Shopify adapter — field mapping and disclosed gaps

Epic 14 proves `CatalogPersistenceAdapter` can wrap an entire third-party platform, not just a
raw DB (adapter-sqlite, adapter-postgres). This is the mapping this adapter implements against
Shopify's Admin GraphQL API, and what it deliberately does not cover.

## Product ↔ Shopify Product

| Core `Product` field       | Shopify field                          | Notes |
|-----------------------------|-----------------------------------------|-------|
| `id`                        | `id` (GID, e.g. `gid://shopify/Product/123`) | Used verbatim as our `id` -- no re-mapping table needed, Shopify's GIDs are already globally unique strings. |
| `slug`                      | `handle`                                | |
| `title`                     | `title`                                 | |
| `description`               | `descriptionHtml`                       | Stored/returned as HTML, matching Shopify's own model; this adapter does not strip markup. |
| `identifyingAttributeKeys`  | `options[].name`, lowercased            | Shopify's product options (e.g. "Color", "Size") ARE its identifying-attribute keys -- the same concept under a different name. |
| `status`                    | `status` (`ACTIVE`\|`ARCHIVED`\|`DRAFT`), lowercased | Direct 1:1 mapping -- Shopify's product status enum already matches `ProductStatus` once lowercased. |

## Sku ↔ Shopify ProductVariant

| Core `Sku` field          | Shopify field                                   | Notes |
|-----------------------------|--------------------------------------------------|-------|
| `id`                        | variant `id` (GID)                                | |
| `productId`                 | parent product `id` (GID)                         | |
| `identifyingAttributes`     | `selectedOptions[]` (`{name, value}` → `{key: name.toLowerCase(), value}`) | |
| `price`                     | `price` (decimal string) → minor units (`Math.round(price * 100)`), currency from the shop's `currencyCode` | Shopify variant prices are decimal major-unit strings; core `Money` is minor-unit integers, per docs/subsystems/00-core-schema.md. |
| `status`                    | inherited from the parent product's status        | **Disclosed gap:** Shopify variants have no independent status of their own -- there is nothing to map. A variant of an archived product is treated as archived. |

## ProductAttribute ↔ Shopify Metafields

`ProductAttributeRepository` maps to Shopify product metafields under a single reserved
namespace (`mercatus_liber`). `listByProduct` reads that namespace's metafields;
`save`/`remove` use `metafieldsSet`/`metafieldsDelete`. Values are stored as JSON-serialized
strings (Shopify metafields are typed, but a single generic `json` type covers every
`AttributeValue` this project defines without inventing a second type-mapping table).

## What this adapter deliberately does NOT do

- **No live network integration test.** Like the Stripe adapter (payments, epic 1) and the
  Postgres adapter's fake pool (epic 8), this ships with the real Shopify Admin GraphQL client
  call shape mocked in tests -- no live Shopify store/credentials exist in this environment.
  Documented here as the same disclosed gap, not silently glossed over.
- **No product creation via REST; GraphQL only.** Shopify's Admin API has both a legacy REST
  surface and the current GraphQL Admin API; this adapter uses GraphQL exclusively (the
  actively developed, non-deprecated surface as of this writing).
- **No bulk/webhook sync.** `save()` writes one product/SKU at a time via `productSet` /
  `productVariantsBulkUpdate` mutations -- sufficient to prove the adapter contract, not a
  high-throughput bulk-import pipeline. A real deployment syncing a large existing Shopify
  catalog would want Shopify's Bulk Operations API instead; out of scope here.
- **Rate limiting.** Shopify's Admin API enforces GraphQL query-cost throttling; this adapter
  does not implement backoff/retry. A production hardening pass would add it; not required to
  prove the architectural point this epic exists to make.

These gaps are exactly why this is a **reference** adapter (proving the pattern works) rather
than a production-hardened Shopify integration -- the same bar every other adapter in this repo
was held to (adapter-sqlite/adapter-postgres ship in-memory-DB-simple, not connection-pooled/
production-tuned either).
