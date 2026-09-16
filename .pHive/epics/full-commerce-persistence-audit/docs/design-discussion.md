# Design Discussion — full-commerce-persistence-audit

## 0. Prelude

No prior KG decisions or north-star block exist for this repo. Grounded entirely in direct code audit this session: every `createInMemory*` call site in `apps/reference-storefront/lib/services.ts`, and every real `types.ts` for the 13 affected packages, read in full (not summarized from memory).

## 1. Goal

Confirmed by direct audit, not assumed: **only 3 of ~16 subsystems this framework has built have any real persistence** — catalog (products/skus/attributes), categories (marketing-catalog, epic 57), and inventory (Postgres-only). Every other subsystem is unconditionally in-memory-only, regardless of which backend a demo resolves to, and always has been:

| # | Package | Entity | Real interface |
|---|---|---|---|
| 1 | `@mercatus-liber/cart` | `Cart`/`CartItem` | `CartRepository` |
| 2 | `@mercatus-liber/checkout-orders` | `Order` | `OrderRepository` |
| 3 | `@mercatus-liber/account` | `CustomerProfile` | `CustomerProfileRepository` |
| 4 | `@mercatus-liber/promotions` | `Promotion` | `PromotionRepository` |
| 5 | `@mercatus-liber/reviews` | `Review` | `ReviewRepository` |
| 6 | `@mercatus-liber/storefront-views` | `StorefrontView` | `StorefrontViewRepository` |
| 7 | `@mercatus-liber/bundles` | `Bundle` | `BundleRepository` |
| 8 | `@mercatus-liber/recommendations` | `RecommendationRule` | `RecommendationRepository` |
| 9 | `@mercatus-liber/advertising` | `Campaign` | `CampaignRepository` |
| 10 | `@mercatus-liber/service-areas` | `ServiceArea` + assignments | `ServiceAreaRepository` + `ServiceAreaProductRepository` |
| 11 | `@mercatus-liber/internal-bi` | `BiEvent` | `BiEventLogRepository` |
| 12 | `@mercatus-liber/fulfillment` | sku→provider mapping | `FulfillmentRoutingRepository` |
| 13 | `@mercatus-liber/search` | — | **no persistence needed** (see §2e) |

The user's own words: *"where are orders and shopping cart and user profiles... this database is way too light for a true commerce implementation... these aren't commercial commerce store level."* — an order that resets on restart, a cart nobody's session survives, a customer account that vanishes, aren't a real commerce store, and every demo-store review of the actual live database confirms this directly (not a claim from code alone).

**Plus a genuinely separate, higher-stakes architectural question**, raised directly by the user: *"if the store has 3 catalogs, how is the catalog created and defined? with its own metadata etc?"* Confirmed by direct audit: **there is no `Catalog` entity anywhere in this codebase.** `Product` (`@mercatus-liber/core`) has no `catalogId` field at all. What reads as "3 catalogs" today is actually 3 fully-separate demo-store databases (epic 31's multi-tenant architecture) — not one shared product pool with a real, named `Catalog` record each product belongs to. User confirmed at this epic's own sign-off gate: build a real Catalog entity, not just clarify the existing separation.

## 2. Proposed Approach

### 2a. The Catalog entity — two real shapes, genuinely different blast radius, needs your call before I build either

**Shape 1 — a lightweight, per-demo `Catalog` record (recommended).** Add a small `Catalog { id, slug, name, description, createdAt }` entity, one real row per demo store (print-shop/northline/broadleaf), persisted in whichever backend that demo already resolves to. `Product` itself is **unchanged** — no new field, no migration of existing product data, zero blast radius on any of the 13 packages above or the 4 adapter packages. This directly answers the literal question asked ("how is the catalog created and defined, with its own metadata") — each store's catalog becomes a real, queryable record with a real name/description/brand metadata, instead of an implicit "whatever's in this demo's DB." Products stay scoped to a catalog exactly the way they are today (by which demo's persistence instance they live in) — this just gives that existing scope a real identity record alongside it, surfaced on `/architecture` and each store's `/start` page.

**Shape 2 — a real many-to-many Catalog↔Product model.** Add `catalogId` (or a `product_catalog_assignments` join table, mirroring epic 57's `product_category_assignments`) so a SINGLE shared product pool can be sliced into multiple named catalogs, and a product could genuinely belong to more than one. This is a **real, invasive core-schema change**: `Product` (`@mercatus-liber/core`) gains a new relationship every one of the 13 packages above plus all 4 persistence adapters plus every existing seed file would need to account for, and it only makes sense if the 3 demo stores stop being 3 fully-separate businesses (print-shop/Northline/Broadleaf are actually unrelated brands in this reference storefront, not 3 channels selling the same underlying inventory) and start sharing one product pool — which isn't how this reference storefront's own real seed data is modeled today (verified: zero product-slug overlap across all 3 stores, confirmed earlier this session).

**My recommendation: Shape 1.** Shape 2 solves a real problem (Wayfair-style multi-brand-from-one-pool, or a genuine multi-channel retailer), but nothing in this reference storefront's actual data models that scenario — building it now would be real, speculative infrastructure with no real demo proving it works, the same "facade, not real" failure mode already called out this session. Shape 1 is small, directly answers the literal question asked, and is real (a genuine persisted record with genuine metadata) rather than decorative. **If Shape 2 is actually what's wanted — e.g. a future 4th demo store that genuinely shares broadleaf's plant inventory under a different brand — say so explicitly and I'll design that migration properly instead; it's a real, larger epic of its own, not a can appended.**

### 2b. Persistence schema pattern — identical to epic 57, no new pattern to invent

Every one of the 13 repositories above gets a real `create<Backend><Entity>Repository(pool)` function in `packages/adapter-postgres/src/<entity>.ts`, `CREATE TABLE IF NOT EXISTS` DDL appended to the shared `SCHEMA_SQL`, sharing the same `pgPool` every other Postgres-backed repository in `services.ts` already uses — the exact, already-proven pattern from `packages/adapter-postgres/src/categories.ts` (epic 57). Postgres is the primary target (the flagship "real" backend, live and stable all session); SQLite gets parity too (it's this framework's own zero-infra default, and epic 57 already gave it the same category-persistence treatment as Postgres) — Mongo/Convex parity is a real, disclosed follow-up, not built in this same pass, since only Postgres/SQLite are actually live for any demo today (Northline/MongoDB remains blocked on Atlas Network Access from epic 57; Convex is live for Broadleaf but adding 12 more Convex-function files is real, separate work better sequenced after Postgres/SQLite prove the schemas out).

### 2c. Tiering, per the user's own explicit priority

- **Tier 1 (build first) — the commercial core:** `cart`, `checkout-orders` (real orders), `account` (real customer profiles). An order that survives a restart, a cart that persists, a real customer account are the literal minimum for "commercial commerce store level."
- **Tier 2 — marketing/merchandising:** `promotions`, `reviews`, `storefront-views`, `bundles`, `recommendations`, `advertising`. Real coupon codes, real reviews, real curated storefronts that survive a restart.
- **Tier 3 — lower priority, real but less commercially load-bearing:** `service-areas`, `internal-bi` (event log), `fulfillment` (routing map).
- **`search`: no persistence needed, confirmed not assumed** — its own real interface (`reindexAll`, `ProductDataLookup`) and its real wiring (`registerCatalogSearchSync`, rebuilding the index from real catalog events) confirm it's a genuinely rebuildable derived index over already-persisted catalog data, not a second source of truth. Building persistence for it would be redundant, not missing.

### 2d. Real cross-entity relationships found during research (schema design must account for these)

- `Order.customerId` references `CustomerProfile.id` (nullable — guest checkout).
- `Order.items[].skuId` references real SKUs (already persisted).
- `checkout-orders`' `PricingAdjuster.recordApplication` writes back into `promotions` (redemption bookkeeping) — a real cross-subsystem write, not just a read.
- `internal-bi`'s `OrderMetricsSource`/`SkuMetricsSource`/`PromotionMetricsSource` read across orders/catalog/promotions — once those 3 are real, BI's own read-side queries become genuinely meaningful (today they read real in-memory data that happens to reset together, so this was never actually broken, just fragile).
- `bundles.productId` and `recommendations.sourceProductId`/`targetProductIds` reference real products (already persisted) — no new relationship, just confirming the FK-shaped reference is to already-durable data once these land.
- `reviews.verifiedPurchase` reads real order data (a real "paid" order containing the product) — currently checkable only within one in-memory server lifetime; becomes genuinely meaningful once orders persist.

### 2e. What does NOT change in this epic

- No changes to `@mercatus-liber/core`'s `Product`/`Sku` types (per §2a Shape 1).
- No MongoDB/Convex parity for these 13 repositories in this pass (disclosed follow-up, §2b).
- `search` gets no persistence (§2c) — confirmed correct, not deferred.
- Epic 57's per-demo backend resolution (`resolveDemoPersistenceEnv`) is reused as-is, not redesigned.

## 3. Dependencies

- Epic 57 (`per-demo-backend-diversity`, done) — the real `pgPool`-sharing pattern, the `demoEnvPrefix`/`resolveDemoPersistenceEnv` per-demo resolution mechanism, and `packages/adapter-postgres/src/categories.ts` as the literal template every new repository mirrors.
- Real, live Postgres (Supabase) — already stable in production all session.

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| 13 new tables is a lot of surface area for one epic | Medium | Tiered delivery (§2c) — each tier is independently shippable and leaves the product in a working state, per this repo's own vertical-slice convention. |
| `Order`/`Cart` schemas carry nested arrays (`items[]`, `OrderLineItem[]`) that don't map to flat SQL columns as directly as `Category` did | Medium | JSONB columns for line-item arrays (matching `adapter-postgres`'s own established convention for `Product.identifyingAttributeKeys`/`images` — real precedent, not a new pattern) rather than a separate `order_line_items` table; revisit to a real join table only if a genuine query need (e.g. "top-selling SKUs across all orders") requires it, which `internal-bi`'s `getTopProducts` might — flagged as a real open question for the H/V pass, not resolved here. |
| Building 13 repositories risks the same "facade" failure mode already called out — code that exists but isn't proven live | High, directly named by the user | Every tier's closeout story requires the same live-verification discipline epic 57 used: real data written and read back against the real Supabase Postgres instance, not just passing unit tests against a fake pool. |
| The Catalog-entity shape (§2a) is a real fork with different blast radius | High | Explicit user sign-off requested below before story decomposition — not guessed. |

## 5. Open Questions

1. **Catalog entity: Shape 1 (lightweight per-demo record, recommended) or Shape 2 (real many-to-many, core schema change)?** See §2a. Blocks story decomposition for the Catalog-entity stories specifically (not the 13-subsystem persistence work, which is independent).
2. Order/cart line-item storage: JSONB column (matches existing convention) vs. a real normalized line-items table — leaning JSONB per §4, open for the H/V pass to confirm once `internal-bi`'s real query needs are mapped concretely.

## 6. Scale Assessment

**Large.** 13 subsystems plus a real architectural decision (Catalog entity) that touches how every demo store's data is scoped. Per the user's own explicit request ("let's do a full /plan around this"), this gets the real H/V planning + structured outline pass, not an abbreviated one — unlike epic 57, where the design was concretely resolved before story decomposition, this epic has one real, consequential open question (§5.1) that should be resolved via the actual sign-off gate before slicing begins.
