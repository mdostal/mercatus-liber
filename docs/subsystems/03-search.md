# Subsystem 03 — Search

## Purpose
The search page the founder called out as "a big one." Owns query/filter/facet behavior over
products, backed by a **pluggable index adapter** — Solr, Elasticsearch, Algolia, Meilisearch,
or (default, ships in-repo) a simple in-memory/SQLite-backed index good enough for a low-SKU
shop that doesn't want to run a search cluster.

## Depends on
`@core/schema` types. Reads catalog (01) data **only via events**, never a direct query at
request time — search maintains its own denormalized index, kept in sync by subscribing to
`catalog.product.*` and `catalog.sku.*` events and reindexing incrementally. This is the
subsystem where the event-bus decoupling rule matters most: if search depended on catalog
directly for every query, swapping index backends would require touching catalog code.

## Responsibilities
- `SearchIndexAdapter` interface: `index(doc)`, `remove(id)`, `query(params) -> results`,
  `reindexAll()`.
- A default adapter implementation (simple, no external service) so the project works with
  zero infra out of the box; Solr/Elasticsearch/Algolia/Meilisearch adapters are optional
  swap-ins, same pattern as the DB adapters.
- Facet configuration driven by `ProductAttribute.facetable` flags from catalog's full
  attribute map (01/00) — search doesn't invent its own facet config format.
- The search **page's** three default layout templates (list view, grid view, comparison-ish
  dense view) live in the CMS/theming layer (05/06); this subsystem only returns structured
  results, it doesn't render.

## Explicitly NOT this subsystem's job
- Rendering the search page UI (CMS/theming).
- Being the source of truth for product data (catalog is; search is a read-optimized copy).

## Decoupling notes
Search can be deleted and reindexed from scratch at any time — it holds no data that catalog
doesn't already have, by design. That's what makes the "swap Solr for Elasticsearch" story a
config change, not a migration.

## Open questions
1. Default (no-external-service) index implementation — good enough for how many SKUs before
   it needs real infra? Set an honest documented ceiling rather than pretending it scales
   infinitely.
2. Reindex-on-event latency — near-real-time acceptable, or does the default adapter need to
   support synchronous reindex for small catalogs where eventual consistency isn't worth the
   complexity?
3. Does marketing-catalog (02) category data need to feed search facets too (e.g. "browse by
   category" as a facet), and if so is that another event subscription or a read at index time?
