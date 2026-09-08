# Shopify adapter — field mapping and disclosed gaps

Epic 14 proves `CatalogPersistenceAdapter` can wrap an entire third-party platform, not just a
raw DB (adapter-sqlite, adapter-postgres). This is the mapping this adapter implements against
Shopify's Admin GraphQL API, and what it deliberately does not cover.

## The core architectural finding: caller-assigned ids vs. Shopify-assigned GIDs

`CatalogPersistenceAdapter` implicitly assumes the *caller* assigns entity ids
(`@mercatus-liber/catalog`'s service calls `randomUUID()` before ever calling
`persistence.products.save(product)`) -- true for adapter-sqlite/adapter-postgres, where any
string is a valid primary key. Shopify assigns its own GIDs server-side; a caller cannot dictate
a product's id at creation time. This is the real, interesting seam a "wrap a third-party
platform" adapter exposes that a raw-DB adapter never has to.

**Resolution:** this adapter stores the caller's id as a reserved metafield
(`mercatus_liber.external_id`) on every Shopify product/variant it creates, and always resolves
`.id` on read paths (`get`, `getBySlug`, `list`) back to that metafield's value -- never the raw
Shopify GID. `save()` first searches for an existing product/variant by that metafield (Shopify's
`metafields.<namespace>.<key>:'<value>'` search-query syntax); if found, updates it by its real
Shopify GID; if not, creates a new one and stamps the metafield. The result: from the outside,
this adapter behaves exactly like adapter-sqlite/adapter-postgres -- the id you save with is the
id you get back -- even though internally two different id systems are being reconciled. Every
canonical scenario this epic's test suite runs proves that round-trip holds.

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
| `price`                     | `price` (decimal string) → minor units (`Math.round(price * 100)`), currency from `config.currency` | Shopify variant prices are decimal major-unit strings; core `Money` is minor-unit integers, per docs/subsystems/00-core-schema.md. Currency is a config field (default `"USD"`), not queried from the shop's own currency setting each call -- a deliberate scope simplification, not a hidden gap. |
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
