# Design discussion: shopify-migration-import-tool (epic 78)

## 1. Why this epic, and why now

Explicit user ask, 2026-10-07: "we need a way to import directly from Shopify to transfer over
and make that simple." Distinguished explicitly from the already-existing `adapter-shopify`
package (verified by reading it directly: `createShopifyAdapter()` implements the real
`CatalogPersistenceAdapter` interface -- it's a **live wrapper**, every catalog read/write
proxies through Shopify's own API in real time, forever. A merchant using it is still fully
on Shopify's infrastructure; Mercatus Liber is just a UI/admin/AI layer on top). What's missing,
and what this epic builds, is the opposite shape: a **one-time migration tool** that reads a
merchant's real data out of an existing Shopify store and writes it into Mercatus Liber's own
native persistence (Postgres, SQLite, whichever the merchant picks), so they can genuinely
leave Shopify -- the actual "remove folks from Shopify" commercial thesis epic 16
(`deploy-tool-and-auto-update`) already names as this project's point, which until now has had
no real path for a merchant who already has live Shopify data to bring it over.

## 2. What already exists, reused here

- `packages/adapter-shopify/src/graphql-client.ts` -- a real, working Shopify Admin GraphQL
  client (auth, request shape). This epic's read side reuses it directly rather than
  reimplementing Shopify auth/transport from scratch.
- `packages/adapter-shopify/src/mapping.ts` -- existing Shopify-shape-to-Mercatus-Liber-shape
  mapping logic, written for the live-wrapper adapter's read path. Likely reusable, at least
  partially, for this tool's own product/variant mapping -- read it first, don't duplicate
  logic that already exists and is already tested.
- `packages/catalog`'s `CatalogService.createProduct`/`generateSkus`, `packages/marketing-
  catalog`'s `createCategory`/`assignProductToCategory`, `packages/inventory`'s stock-setting
  calls -- the real native write path this tool writes through, the same services every other
  part of this app already uses. This tool is an app-layer orchestration script, not a new
  core subsystem.
- `apps/reference-storefront/lib/idempotent-seed.ts`'s `upsertProduct`/`upsertCategory` pattern
  -- the established idempotency convention (check-by-slug before create) this tool's own
  writes must follow, so a re-run after a partial failure never duplicates data.

## 3. Scope

**In scope:**
1. A real Shopify → native read path: products, variants (→ SKUs with real
   `identifyingAttributes`), collections (→ marketing-catalog categories), and current
   inventory levels, paginated correctly against Shopify's real GraphQL API (cursor-based,
   verify the real current API version/shape, don't assume from training data).
2. A real write/import path into Mercatus Liber's native persistence, reusing the exact same
   `CatalogService`/`MarketingCatalogService`/inventory-adapter calls the rest of the app uses
   -- no bespoke bulk-insert path that bypasses the real service layer's own validation
   (`assertIdentifyingKeysMatch`, etc.).
3. A real **dry-run mode**: report exactly what would be imported (counts, a sample of
   products/categories, any records that would be skipped or need manual attention) without
   writing anything -- the first thing any real user should run before a real import.
4. Idempotency: safe to re-run after a partial failure (network error mid-import, etc.) without
   duplicating already-imported records -- same `upsertProduct`-style pattern already
   established elsewhere in this repo.
5. A real CLI entry point (new package `@mercatus-liber/migrate-shopify`, or an addition to the
   existing `create-store` CLI's own convention -- decide based on what's actually cleaner once
   the read/write path is built, don't pre-commit to a structure before seeing the real shape)
   and real documentation: how an actual user with an actual Shopify store runs this against
   their own store and their own choice of native backend.

**Explicitly out of scope:**
- Orders/customers/historical sales data migration -- real, but a materially different and
  riskier data-sensitivity category than catalog data; scoped out for a focused first pass,
  disclosed as real future work, not silently dropped.
- Images/media migration -- Shopify product images would need to flow through
  `packages/media`'s own adapter pattern (Cloudinary or passthrough); real integration point,
  but adds a second external-system dependency to an already-real-enough first scope. Disclose
  as a known follow-up, don't silently skip or half-implement it.
- Theme/storefront content migration -- out of scope entirely; this tool migrates catalog
  data, not a Shopify theme, which has no equivalent shape in this framework anyway.

## 4. The honest, disclosed credential gap

No real Shopify store credentials exist in this environment (checked directly against the
`mercatus-liber-commerce` Portunus vault before writing this plan -- confirmed absent). This
means: the tool can and must be built for real, and tested for real against **injected fakes**
implementing the same GraphQL-client interface `adapter-shopify` already uses for its own
tests (grep its test suite for the real pattern, mirror it) -- but **live end-to-end
verification against a real Shopify store is blocked**, the same honest-disclosure shape this
session has already applied to Printful/Printify/Shippo/GA4/a real Stripe key/MongoDB Atlas.
State this plainly in the tool's own README and in the epic-backlog closeout row -- never
claim a live-verified import that never happened.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Shopify's real GraphQL API shape drifts from what's assumed | Story 1 explicitly re-verifies the real current API version/field shapes against Shopify's own live GraphQL schema introspection or current docs, not training-data assumptions |
| A partial import leaves inconsistent state (e.g. products created, categories not yet assigned) | Idempotent, resumable writes; dry-run first; real tests proving a second run after a simulated partial failure completes cleanly with no duplicates |
| Scope creep into orders/customers/images on top of the catalog-only first pass | Explicit scope boundary above, each out-of-scope item disclosed as real future work |

## 6. Scale assessment

**Medium-large.** Real new capability, but built heavily on existing, already-tested plumbing
(`adapter-shopify`'s GraphQL client, the native service layer's existing write path, the
established idempotent-upsert convention). Proceeding to stories without a full H/V planning
pass, matching this session's Medium-scope precedent, but with slightly more story granularity
than a typical Medium epic given the real technical surface (read path, write path, CLI/docs
each deserve their own story and their own real test coverage).
