# Design Discussion — full-commerce-persistence-audit

## 0. Prelude

Direct follow-up to epic 57 (per-demo-backend-diversity), triggered by the user's live audit of production: *"where are orders and shopping cart and user profiles... this database is way too light for a true commerce implementation... these aren't commercial commerce store level."* Confirmed by direct code audit, not assumed (see §1). Scope expanded twice more during this same conversation, both explicit, both folded in below:

1. *"if the store has 3 catalogs, how is the catalog created and defined? with it's own metadata etc? I see the join table to make a catalog, but this didn't do what was asked"* → resolved: build a real `Catalog` entity (§2b), confirmed via direct user sign-off.
2. *"we have to have a REAL RUNNING FULL STORE ON EACH SAMPLE and we give full viewer access... we can fully reset data fully to the demo dataset... we can't give away a free shopify replacement if it can't replace shopify -- AND WE CAN'T USE IT ON OUR OWN STORE IF IT ISN'T THAT LEVEL!"* → resolved: (a) every subsystem below must be genuinely commerce-correct, not just persisted for its own sake; (b) a real "reset to demo dataset" admin action (§2d), since public viewer access to a real, mutable store needs a real undo; (c) the bar for "done" here is explicitly "we could run our own real store on this," not "the demo looks complete."

## 1. Goal

**Confirmed via direct audit of every `createInMemory*` call in `apps/reference-storefront/lib/services.ts`:** exactly THREE things have real persistence today — catalog (products/skus/attributes), categories/product-category-assignments (epic 57), and inventory (Postgres-only). Every other subsystem this framework has built is unconditionally in-memory-only, regardless of which backend a demo resolves to, and always has been:

- **Commercial core (explicit top priority):** cart, checkout-orders (real customer orders), account (customer profiles)
- **Marketing/merchandising:** promotions, reviews, storefront-views (the `StorefrontView` entities themselves — epic 57 only fixed marketing-catalog's *categories*, not this structurally separate package), bundles, recommendations, advertising
- **Operational:** service-areas, internal-bi event log, fulfillment routing
- **Possibly-fine-as-is (design question, not assumed):** search index — likely legitimately a rebuildable projection over real catalog data, not a source of truth in its own right; resolved in §2e.

**Plus, per the user's explicit correction:** there is no `Catalog` entity anywhere in this codebase. "3 catalogs" today means 3 fully separate, isolated demo-store databases (epic 31's multi-tenant architecture) — not 3 named, addressable `Catalog` records with their own metadata that products are genuinely assigned to. This is a real, confirmed gap (grepped `packages/core/src/schema.ts` and `packages/catalog/src/service.ts` — no `catalogId` field exists anywhere on `Product`).

**Goal:** every demo store becomes a genuinely complete, commercially-real commerce implementation — real orders that survive a restart, a real cart, a real customer account, real promotions/reviews/bundles/recommendations/advertising/service-areas that persist, a real `Catalog` entity with its own identity and metadata that products are actually assigned to, and a real, safe way to reset a demo back to its canonical seeded state after public viewers have been poking at it. The explicit bar: this framework needs to be usable as the user's *own* real store, not just an impressive-looking demo.

## 2. Proposed Approach

### 2a. Persistence pattern — identical to epic 57's category work, now applied 12 more times

Every one of the 12 remaining in-memory subsystems gets the exact same treatment epic 57 already proved out for categories: a `create<Backend><Entity>Repository(pool)` function per repository interface, DDL appended to the shared `SCHEMA_SQL`, sharing the same `pgPool` every other Postgres-backed repository in a demo already uses. **Postgres only, in this pass** — Mongo/SQLite/Convex parity for these 12 is explicitly deferred (per the user's own prioritization: "orders, shopping cart, and user profiles... top priority," with the DB-diversity story already proven by epic 57's catalog/category work). Real schemas for each of the 12 are grounded in each package's own actual `Repository` interface — see the research brief for the literal, verbatim interface signatures this design is built from, not paraphrased guesses.

### 2b. A real `Catalog` entity, resolved design

**Placement:** `@mercatus-liber/catalog` itself (not core, not marketing-catalog) — a `Catalog` is fundamentally a *sales-catalog* scoping/identity concept (which products exist for this store), the same package that already owns `Product`/`Sku`/`CatalogService`. This mirrors the exact reasoning that put `Category` in `@mercatus-liber/marketing-catalog` (a genuinely different, marketing-facing concept) rather than core.

**Shape, additive (NOT a change to the core `CatalogPersistenceAdapter` contract every backend adapter implements):**

```ts
export interface Catalog {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface CatalogRepository {
  get(id: string): Promise<Catalog | null>;
  getBySlug(slug: string): Promise<Catalog | null>;
  list(): Promise<Catalog[]>;
  save(catalog: Catalog): Promise<void>;
}

/** Many-to-many, mirroring ProductCategoryRepository's exact shape -- a product COULD belong to more than one catalog (a real pattern in commercial multi-catalog platforms, e.g. a shared master catalog feeding several storefronts), even though every demo here assigns 1:1 in practice today. */
export interface ProductCatalogRepository {
  listCatalogIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInCatalog(catalogId: string): Promise<string[]>;
  assign(productId: string, catalogId: string): Promise<void>;
  unassign(productId: string, catalogId: string): Promise<void>;
}
```

**Why additive, not a `CatalogPersistenceAdapter` change:** extending the core contract would force every existing backend adapter (Postgres/SQLite/MongoDB/Convex) to implement `catalogs`/`productCatalogs` just to keep compiling — a real breaking change to an interface 4 packages already implement, for a feature only Postgres needs in this pass. Epic 57 already proved the additive side-repository pattern works cleanly (4 parallel implementations, zero core-contract changes, real live verification) — same shape here, same low blast radius.

**Real wiring:** each of the 3 demo stores gets exactly ONE real `Catalog` record seeded (e.g. "The Print Shop," with its own real description) that every one of that demo's products is assigned to via `ProductCatalogRepository.assign`. This makes the "3 catalogs" claim literally true and queryable — `catalog.getCatalogBySlug("the-print-shop")` returns a real record with real metadata, not an implicit inference from which database a product happens to live in.

### 2c. `CatalogService` gains real catalog methods

Mirroring `MarketingCatalogService`'s own wrapping of `CategoryRepository`/`ProductCategoryRepository`: `createCatalog`, `getCatalogBySlug`, `listCatalogs`, `assignProductToCatalog`. `apps/reference-storefront/lib/adapter-info.ts`'s per-demo `/start` page (epic 54) gets a real "Catalog: {name} — {description}" line, sourced from this, not hardcoded copy.

### 2d. Reset-to-demo-dataset, resolved design

Real, explicit user requirement: public viewers get real mutate-adjacent capability (submitting reviews, adding to cart, placing sandbox orders) against now-real persisted data — that needs a real undo. New owner-only admin action (`reset_demo_data`, a 4th `AdminAction` alongside `view`/`mutate`/`manage_users` — owner-only in the permission matrix, since this is destructive and irreversible for that demo's data):

1. Requires typed confirmation (the demo's own slug, typed exactly — same pattern real destructive admin tools use, e.g. GitHub's "type the repo name to delete") — no bare confirm button for a real data-wiping action.
2. Deletes every real persisted row scoped to that one demo, across every table this epic adds (catalog/categories/catalog-assignments/cart/orders/customer-profiles/promotions/reviews/storefront-views/bundles/recommendations/advertising/service-areas) — scoped by demo, never touching another demo's data (real risk given all 3 demos may share one Postgres database).
3. Evicts that demo's entry from `services.ts`'s `servicesByDemo` module-level cache, so the next request cold-starts and re-seeds from scratch via the demo's own real, already-idempotent seed function (epics 48/57).
4. Live-verified: trigger a real reset against a real seeded demo, confirm the data is genuinely gone, confirm the very next page load re-seeds correctly and completely (not partially).

### 2e. Search index — resolved, not deferred

Read `packages/search`'s real interface (see research brief) before concluding, but the design lean is: an in-memory index rebuilt from real catalog data via `registerCatalogSearchSync` (already wired to catalog events) is legitimately correct architecture — a search index is a derived projection, not a source of truth, and real commerce platforms (Shopify's own storefront search, Algolia-backed setups) universally rebuild search indexes from the real data rather than treating the index itself as durable state. **Resolved: no persistence needed for search** — confirm this holds once the research brief's actual interface read is in, don't just assume.

## 3. Dependencies

Epic 57 (done) — the `pgPool`-sharing pattern, `resolveDemoPersistenceEnv`, and the proven additive-side-repository shape this epic repeats 12+1 more times. Epics 48 (idempotent seeding) — every new persisted subsystem's seed calls need the same check-by-slug-or-id-before-create discipline, and the reset mechanism (§2d) depends on it directly (a reset's re-seed is, definitionally, a second seed run against now-empty tables).

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Reset action accidentally wipes another demo's data (shared Postgres database across all 3 demos) | High | Every DELETE scoped by an explicit demo/catalog identifier column, never a bare `DELETE FROM table`; live-verified with 2+ demos seeded simultaneously before/after a single demo's reset. |
| 12 new repositories × real DDL is a lot of schema surface to get wrong | Medium | Same low-risk pattern epic 57 already validated 4 times over; each repository is independently testable against a real fake-pool double plus (where practical) the real live Postgres instance, mirroring epic 57's own verification bar exactly. |
| Scope creep beyond what's needed to prove "commercial-grade" | Medium | Explicit user prioritization (commercial core first, marketing/merchandising second, operational third, search likely exempt) keeps story sequencing aligned to what actually matters for "could run our own store on this." |

## 5. Open Questions

Resolved inline above (2a-2e). Remaining, deferred to story-writing: exact DDL for each of the 12 subsystems (grounded in the research brief's literal interface reads, written into each story rather than guessed here).

## 6. Scale Assessment

**Large.** 12 new persisted subsystems plus a genuine new `Catalog` entity plus a real destructive reset mechanism — multi-system, correctness-critical (real commerce data), explicitly requested as a full `/plan` pass by the user. Proceeding to a real vertical-slice breakdown (Phase B2) before story decomposition, prioritized exactly as the user specified: commercial core (cart/orders/accounts/catalog-entity) → marketing/merchandising (promotions/reviews/storefront-views/bundles/recommendations/advertising) → operational (service-areas/internal-bi/fulfillment-routing) → reset mechanism (depends on everything above existing first) → live verification.
