# Subsystem 01 — Product Catalog

## Purpose
Owns product and SKU lifecycle: creating products, defining which attributes are identifying
(fork SKUs) vs. descriptive (full attribute map), generating/managing SKUs as combinations of
identifying attribute values, and product status (draft/active/archived).

## Depends on
`@core/schema` types only. Nothing else. The catalog subsystem must work standalone (e.g. in a
test harness) with zero knowledge that carts, orders, or CMS exist.

## Responsibilities
- CRUD for `Product` and `Sku` against the `ProductRepository`/`SkuRepository` interfaces
  (concrete implementation supplied by whichever adapter the host wires in).
- CRUD for `ProductAttribute` (the full attribute map) against its own repository interface.
- **SKU generation helper:** given a product's `identifyingAttributeKeys` and the set of
  possible values for each, generate the cartesian product of SKUs (with a way to exclude
  invalid combinations — e.g. a color/size combo that doesn't exist for a given product).
- **Options-on-a-page support:** exposes a query like "given this product, what are the
  available identifying attribute value combinations, and which SKU does a given combination
  resolve to" — this is what a PDP's variant-picker UI calls (PDP subsystem consumes this, does
  not reimplement it).
- Publishes `catalog.product.created|updated|archived` and `catalog.sku.created|updated` events
  for search (reindex) and inventory (new SKU needs a stock record) to react to.

## Explicitly NOT this subsystem's job
- Rendering the PDP (subsystem 04).
- Deciding which category a product belongs to (subsystem 02 — marketing catalog references
  catalog products by id, catalog never references categories).
- Search indexing itself (subsystem 03 subscribes to catalog events and reindexes; catalog
  doesn't know a search index exists).
- Stock levels (subsystem 11 — inventory owns "how many," catalog owns "what exists").

## Decoupling notes
Marketing catalog (02), search (03), PDP (04), cart (07), and inventory (11) all read from
catalog via the `ProductRepository`/`SkuRepository` interfaces or via events — never by
importing catalog's internal implementation. This is the subsystem most other subsystems
depend on (read-only), so its interface stability matters more than any other package's.

## Open questions
1. Draft/active/archived — is a fourth state needed for "active but hidden from search/nav but
   directly linkable" (common for a soft-launch SKU)?
2. Cartesian-product SKU generation for products with many identifying attributes can explode
   combinatorially — cap/guard needed, or leave it to the caller?
3. Does a Product need a notion of "default SKU" (what a PDP shows before the shopper picks
   options) as a core concept, or is that purely a PDP-layer concern?
