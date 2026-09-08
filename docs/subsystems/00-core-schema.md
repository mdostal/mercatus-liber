# Subsystem 00 — Core Schema & Adapter Contracts

## Purpose
The one shared vocabulary every other subsystem builds against. This package (`@core/schema`)
ships **types and interfaces only** — no storage, no business logic, no framework code. Every
other subsystem imports from here and nowhere else in core.

## Core entities

### Product & SKU
A **Product** is the conceptual thing being sold (e.g. "Dragon Cable Organizer"). A **SKU** is
a concrete, purchasable variant of a product, built as a combination of **identifying
attributes** (color, size, material, etc.) set dynamically per product — not a fixed
color/size/whatever schema baked into core. This directly matches the founder's spec: "you can
make new SKUs as a mix of identifying attributes... set dynamically to build SKUs."

```ts
type AttributeValue = string | number | boolean;

interface IdentifyingAttribute {
  key: string;                // e.g. "color", "size"
  value: AttributeValue;      // e.g. "red", "large"
}

interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  // Which attribute keys are "identifying" (combine to define a SKU) for this product —
  // e.g. ["color", "size"]. Different products can have entirely different identifying-
  // attribute sets; nothing in core assumes color/size are universal.
  identifyingAttributeKeys: string[];
  status: "draft" | "active" | "archived";
}

interface Sku {
  id: string;
  productId: string;
  identifyingAttributes: IdentifyingAttribute[]; // must match the product's identifyingAttributeKeys
  price: Money;
  status: "draft" | "active" | "archived";
}

interface Money {
  amount: number;    // minor units (cents) — never a float
  currency: string;  // ISO 4217
}
```

### Full Attribute Map (the searchable/descriptive layer)
Separate from identifying attributes. This is the founder's "full product attributes map...
lets you define things around the product so you have other things to search on it" — the
broader descriptive/faceted data that feeds a search index (Solr, Elasticsearch, Algolia, or
the default simple implementation in subsystem 03), independent of which attributes actually
fork a product into distinct SKUs.

```ts
interface ProductAttribute {
  productId: string;
  key: string;              // e.g. "material", "weight_grams", "printer_compatible"
  value: AttributeValue | AttributeValue[];
  facetable: boolean;        // should search/filter UIs expose this as a facet?
}
```

A product's identifying attributes (which define SKUs) and its full attribute map (which
defines what's searchable/facetable) are deliberately separate concepts sharing the same `key`
namespace where they overlap — e.g. "color" might be both an identifying attribute (forks
SKUs) and facetable (appears as a search filter), but a product could have a facetable
attribute like "printer_compatible" that never forks a SKU.

### Category (marketing catalog anchor point)
Defined fully in subsystem 02; core only owns the minimal shape other subsystems need to
reference a category by id.

```ts
interface CategoryRef {
  id: string;
  slug: string;
}
```

## Adapter contracts (interfaces every persistence adapter must implement)
Core defines these; it implements none of them. `adapter-postgres` and `adapter-sqlite` (see
top-level ARCHITECTURE.md) are reference implementations proving the interface is really
adapter-agnostic.

```ts
interface ProductRepository {
  get(id: string): Promise<Product | null>;
  getBySlug(slug: string): Promise<Product | null>;
  list(filter?: ProductFilter): Promise<Product[]>;
  save(product: Product): Promise<void>;
}

interface SkuRepository {
  get(id: string): Promise<Sku | null>;
  listByProduct(productId: string): Promise<Sku[]>;
  save(sku: Sku): Promise<void>;
}

// Every other subsystem (cart, orders, categories, attributes...) defines its own
// Repository interface in its own package, following this same shape. Core does not
// enumerate them all here — that would recreate the tight coupling this project exists
// to avoid.
```

## Event bus contract
A minimal typed pub/sub interface, implemented by a default in-process adapter (good enough
for a single-process deploy like the reference storefront) with room for a Redis/queue-backed
adapter later for multi-instance deploys.

```ts
interface EventBus {
  publish<T>(eventName: string, payload: T): Promise<void>;
  subscribe<T>(eventName: string, handler: (payload: T) => Promise<void>): void;
}

// Naming convention: "<subsystem>.<thing>.<pastTenseVerb>", e.g.:
//   "checkout.order.placed"
//   "inventory.stock.depleted"
//   "catalog.product.updated"
```

## What does NOT belong here
- No React/Next.js/framework-specific types — core is renderer-agnostic.
- No concrete storage code (no SQL, no ORM imports).
- No business rules (e.g. "a SKU must have a price > 0" is validation logic that belongs to
  the catalog subsystem, not baked into the type definition itself).

## Open questions
1. Money as minor-units integer is assumed above — confirm no multi-currency-per-SKU
   requirement that would need a richer type.
2. Should `ProductAttribute` values support structured/nested data (e.g. a spec sheet as JSON)
   or stay strictly scalar/array-of-scalar?
3. Event bus delivery guarantees (at-least-once vs. best-effort) for the default in-process
   adapter — matters once inventory/notifications depend on events firing reliably.
