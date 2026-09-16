# Design Discussion — per-demo-backend-diversity

## 0. Prelude

No prior KG decisions or north-star block were queried for this pass (this repo's `.pHive/project-profile.yaml` is a placeholder, and no `kg_why` history exists here) — proceeding on direct codebase research instead, consistent with how every other epic in this repo's `.pHive/planning/epic-backlog.md` has been grounded.

## 1. Goal

Epics 51-53 built and live-verified 4 real `CatalogPersistenceAdapter` implementations (SQLite, Postgres, MongoDB, Convex), but `apps/reference-storefront/lib/services.ts` resolves the active backend from **one process-wide env-var priority chain**, applied identically to all 3 demo stores. Only one backend can ever be live at a time across the whole deployment — today, that's Postgres for all 3 stores.

The user's own explicit correction this session: *"the point of it was ensuring we could DO others... not just default to all postgres -- the purpose was showing off the capabilities."* Real infra now exists to make this concrete:

- **Postgres** (Supabase, transaction-pooler) — already live in production, backing all 3 demos today.
- **MongoDB Atlas** — a real cluster, connection verified this session (live write+read against a real collection).
- **Convex** — a real project + deployment (`kindhearted-corgi-798`), real schema+functions already deployed via the Management API, live write+read verified end-to-end through `connectConvexAdapter`.

**Goal:** print-shop stays on Postgres (already live, don't disrupt it), northline switches to the real MongoDB Atlas cluster, broadleaf switches to the real Convex deployment — so the live site visibly proves 3 demo stores running 3 genuinely different real database backends simultaneously, provable from `/architecture` and this session's new per-store `/start` pages.

## 2. Proposed Approach

### 2a. Per-demo env-var override mechanism (resolves open question 1)

`buildServices(demoSlug)` currently reads 4 global vars once: `DATABASE_URL > MONGODB_URL > CONVEX_URL > SQLITE_FILE_PATH > in-memory`.

**Resolved design:** add a per-demo override tier, checked *before* falling back to the existing global chain, using a `<PREFIX>_` env-var naming convention derived from the demo slug (`print-shop` → `PRINT_SHOP`, via `.toUpperCase().replace(/-/g, "_")`):

```ts
function demoEnvPrefix(demoSlug: DemoSlug): string {
  return demoSlug.toUpperCase().replace(/-/g, "_");
}

function resolveDemoPersistenceEnv(demoSlug: DemoSlug) {
  const prefix = demoEnvPrefix(demoSlug);
  const perDemo = {
    databaseUrl: process.env[`${prefix}_DATABASE_URL`],
    mongodbUrl: process.env[`${prefix}_MONGODB_URL`],
    convexUrl: process.env[`${prefix}_CONVEX_URL`],
    sqliteFilePath: process.env[`${prefix}_SQLITE_FILE_PATH`],
  };
  const hasOverride = Object.values(perDemo).some(Boolean);
  return hasOverride
    ? perDemo
    : {
        databaseUrl: process.env.DATABASE_URL,
        mongodbUrl: process.env.MONGODB_URL,
        convexUrl: process.env.CONVEX_URL,
        sqliteFilePath: process.env.SQLITE_FILE_PATH,
      };
}
```

**Why "any override present → per-demo mode, ignore global entirely" (not "per-demo var wins, else fall to the matching global var"):** the naive per-field-fallback design has a real bug — if northline only sets `NORTHLINE_MONGODB_URL` and falls back to the *global* `DATABASE_URL` for its unset `NORTHLINE_DATABASE_URL`, the existing priority chain (Postgres > Mongo) means northline would resolve to the global Postgres URL and never reach Mongo at all, since Postgres still wins the chain. The all-or-nothing per-demo mode avoids this: once *any* `<PREFIX>_*` var is set for a demo, that demo's resolution uses *only* its own 4 vars (falling to in-memory if none of its own are set), completely bypassing the global vars. A demo with zero per-demo vars set behaves byte-for-byte as it does today (falls through to the existing global chain) — fully backward compatible for any deployment that never adopts per-demo vars.

**Rollout for this deployment:** `PRINT_SHOP_*` unset (falls through to today's global `DATABASE_URL` → Postgres, unchanged); `NORTHLINE_MONGODB_URL` set to the real MongoDB Atlas URI; `BROADLEAF_CONVEX_URL` set to the real Convex deployment URL.

### 2b. `pgPool` and `inventory` become per-demo-scoped too

`pgPool` (hoisted so the Postgres-backed `InventoryAdapter` can share it) and `inventory` (`pgPool ? createPostgresInventoryAdapter(pgPool) : createInMemoryInventoryAdapter()`) both currently read the *global* `DATABASE_URL` directly. Once `pgPool`'s construction uses `resolveDemoPersistenceEnv(demoSlug).databaseUrl` instead, the existing `inventory` line requires **zero changes** — it already correctly ties inventory choice to whichever demo's `pgPool` is non-null. Consequence, confirmed deliberate: northline (Mongo) and broadleaf (Convex) automatically fall back to in-memory inventory, since neither `adapter-mongodb` nor `adapter-convex` has a matching `InventoryAdapter` implementation today (only `adapter-postgres-inventory` exists). This is not a new gap — it's the existing, already-shipped behavior for any non-Postgres backend — just now correctly demo-scoped instead of globally forced to match print-shop's choice.

### 2c. REVISED per explicit user feedback at the design sign-off gate: categories get real persistence too, on every backend

Original proposal (categories stay in-memory, unaffected by this epic) was presented to the user and explicitly corrected: *"Categories and everything else go to the database, they can get loaded in by the store for the marketing catalog and stuff but all of it lives in the backend and gets loaded in when the store is started up and we can add caching."*

Confirmed by reading the actual adapter packages: **no backend implements `CategoryRepository`/`ProductCategoryRepository` today — not even Postgres.** `services.ts` always constructs `createInMemoryCategoryRepository()`/`createInMemoryProductCategoryRepository()` regardless of which `CatalogPersistenceAdapter` is active. This is a real, comprehensive gap affecting all 3 demos already, not something newly introduced by the Mongo/Convex switch — but per the user's direction, this epic now fixes it properly rather than leaving it disclosed-and-deferred.

**Expanded scope:** build real `CategoryRepository`/`ProductCategoryRepository` implementations in all 4 existing adapter packages (`adapter-postgres`, `adapter-sqlite`, `adapter-mongodb`, `adapter-convex`), mirroring each package's own existing products/skus/attributes repository pattern exactly (same file layout, same test conventions, same `externalId`-mapping approach for Convex). `services.ts` wires `marketingCatalog`'s two repositories to the SAME per-demo-resolved backend as `catalog` (section 2a's resolver), so a demo's categories live in whichever real database that demo is already using — never a second, independently-chosen backend. Caching (mentioned by the user as a later addition) is explicitly OUT of this epic's scope — noted as a real, disclosed follow-up, not built here.

**Consequence for `lib/idempotent-seed.ts`'s `upsertCategory`:** its slug-uniqueness check finally has real teeth once categories are actually persisted — previously "future-proofing" (per its own doc comment), now a genuine cold-start-reseed guard, the same real crash class epic 48 already fixed for products.

### 2d. Product idempotency IS correctly supported by both new adapters (resolves open question 2, second half)

`lib/idempotent-seed.ts`'s `upsertProduct` calls `catalog.getProductBySlug(slug)`, which `CatalogService` delegates to `persistence.products.getBySlug(slug)` — confirmed both `packages/adapter-mongodb/src/index.ts` and `packages/adapter-convex/src/index.ts` implement `products.getBySlug` as part of the shared `CatalogPersistenceAdapter` contract (structurally guaranteed, and each has its own passing test suite exercising it). The real cold-start-reseed crash class epic 48 fixed for Postgres is equally guarded for Mongo/Convex — same interface, same idempotency helper, no backend-specific gap.

### 2e. `/architecture` and the per-demo `/start` pages need to become demo-aware for persistence/inventory (resolves open question 3)

`getAdapterInfo()` is currently a flat, demo-agnostic `AdapterInfo[]` — correct for every row EXCEPT persistence and inventory, which are about to genuinely diverge per demo. `/architecture` itself has no `demoSlug` (it's a single global page, deliberately — see its own doc comment: *"this page never claims or implies each store uses a different backend"*, written before this epic existed). Two real call sites need to change:

- `getAdapterInfo(demoSlug?: DemoSlug)`: `persistenceInfo()`/`inventoryInfo()` accept an optional `demoSlug` and resolve via the same `resolveDemoPersistenceEnv` helper section 2a introduces, instead of reading `process.env.DATABASE_URL` directly. Every other row (CMS/payments/analytics/fulfillment/shipping/media) is untouched — those really are global/shared, unaffected by this epic.
- `/demo/[demoSlug]/start/page.tsx` (built this session, epic 54): already calls `getAdapterInfo()` with no argument — update the call site to pass `demoSlug`, so each store's own Start Here page correctly reports *its own* backend, not print-shop's.
- `/architecture`: since it has no single demoSlug, its Persistence/Inventory rows become a **per-demo breakdown** (one line per demo slug) instead of a single flat answer, replacing its own outdated doc comment. This is the real, live, provable "3 stores, 3 backends" claim the whole epic exists to demonstrate.

### 2f. Connection-pooling risk, researched not assumed (resolves open question 4)

This session already hit one real production incident from an *unresearched* assumption about serverless connection pooling (Postgres/Supavisor's session-mode pooler exhausted under concurrent cold starts, fixed with `max: 1` + switching to the transaction-mode pooler). The same class of risk was researched for MongoDB before wiring it in — see the Risks section below for the finding.

Convex's `connectConvexAdapter` uses `ConvexHttpClient`, confirmed (via this session's earlier live research pass, `docs.convex.dev`) to be a stateless HTTPS client, not a pooled TCP connection the way `pg`/`mongodb` drivers are — no equivalent risk class applies to Convex.

## 3. Dependencies

- Epics 51 (`adapter-postgres-inventory`), 52 (`adapter-mongodb`), 53 (`adapter-convex`) — all done, all live-verified this session against real infrastructure.
- Epic 48 (`demo-seed-idempotency`) — done; its `upsertProduct`/`upsertCategory` helpers are already wired into all 3 seed files and (per 2d above) structurally correct against the new backends too.
- Epic 31 (`commerce-landing-and-demo-routing`) — `getServicesForDemo`/`buildServices(demoSlug)`'s existing per-demo service-graph architecture is exactly what this epic extends; no change to its own shape, only to what `buildServices` reads for persistence.
- This session's earlier fixes: `/architecture`'s `force-dynamic` fix (so its now-per-demo breakdown actually reflects live env vars, not a stale build-time snapshot) and the pgPool `max: 1` fix (unaffected by this epic, still applies to whichever demo(s) resolve to Postgres).

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A demo's per-demo override env var is set but wrong the same way `DATABASE_URL` was wrong at first (bad connection string), causing a live 500 the instant it's turned on | Medium | Same incident-response discipline already established this session: test the connection string locally against real infra *before* touching Vercel env vars; if a live 500 occurs anyway, revert the specific per-demo var immediately via the Vercel API and redeploy, diagnose from logs after. |
| MongoDB Atlas connection-pool exhaustion under concurrent serverless cold starts (same class as the real Postgres incident) | **Researched below, not assumed** | See finding. |
| `getAdapterInfo()`'s signature change (`demoSlug?: DemoSlug`) breaks an existing call site that isn't updated | Low | Only 2 real call sites exist in this codebase today (`/architecture`, `/start`) — both are touched by this epic's own stories; `adapter-info.test.ts` covers both the demo-aware and no-arg (backward-compatible) paths. |
| Northline/Broadleaf's now-in-memory inventory (section 2b) resets stock on every cold start, unlike print-shop's persisted Postgres inventory | Low, pre-existing | Not a new regression — this was already true for print-shop-before-Postgres-was-live and is already true for any non-Postgres backend today; disclosed, not silently introduced. |

**MongoDB connection-pooling finding, researched against MongoDB's own current official docs (not assumed):**
- The Node.js driver's default `maxPoolSize` is 100 (`docs.mongodb.com/drivers/node/current/connect/connection-options/connection-pools`).
- MongoDB Atlas's free/flex tiers cap at 500 total connections (`docs.mongodb.com/atlas/reference/free-shared-limitations`, `.../atlas-limits`) — just 5 concurrent cold-started `MongoClient`s at the default pool size could exhaust that cap, the same class of risk that caused the real Postgres/Supavisor incident.
- MongoDB's own "Manage Connections with AWS Lambda" doc's real guidance: construct the client ONCE outside the handler and reuse it (already true here via `services.ts`'s `servicesByDemo` module-level cache), plus a bounded `maxIdleTimeMS`. It gives no specific serverless `maxPoolSize` number.
- Connection model is confirmed TCP-based/pooled (same structural risk class as Postgres, not an HTTP-stateless model like Convex's).

**Already fixed, ahead of story decomposition** (small enough to apply directly rather than gate a whole story on it): `connectMongoAdapter` now passes `{ maxPoolSize: 5, maxIdleTimeMS: 60000 }` to `MongoClient` — 5 is this app's own conservative choice (500-connection Atlas cap ÷ 5 leaves headroom for 100 concurrent cold-started instances before exhaustion, far more than one demo store's real traffic). Verified against the real live Atlas cluster after the change (`packages/adapter-mongodb`, commit `dfb9adb`).

## 5. Open Questions

All 4 of this epic's own originally-open design questions are resolved above (2a-2f). No new open questions remain that would block story decomposition.

## 6. Scale Assessment

**Medium, revised up from the original draft after the user's category-persistence correction, but still not Large.** The added scope (4 new `CategoryRepository`/`ProductCategoryRepository` implementations) is real work but each one is a direct, low-ambiguity mirror of an already-existing, already-tested pattern in the same package (the products/skus/attributes repositories) — no new architectural questions, just more surface area. Vertical slices: (1) 4 adapter-package category-persistence implementations, independently parallelizable since they touch disjoint packages; (2) `services.ts` wiring (per-demo resolver + marketingCatalog rewiring); (3) `adapter-info.ts`/`/architecture`/`/start` demo-awareness; (4) live verification across all 3 demos including a real cold-start-reseed idempotency proof for categories now that they're genuinely persisted. Proceeding directly to story decomposition, same reasoning as the original draft.

## 7. Closeout (2026-09-16)

All 7 stories (pdb-01 through pdb-07) shipped, merged to master, and full monorepo verification (127/127 turbo tasks) passed at every step. Live-verified locally against the real Supabase Postgres, real MongoDB Atlas cluster, and real Convex deployment: correct content, correct per-demo `/architecture` reporting, and idempotency held on two independent cold-start reseeds against both real Mongo and real Convex (zero duplicate product slugs, confirmed by direct query against both databases, not just "no crash"). Along the way, found and fixed 3 real N+1 sequential-query performance bugs that only became visible once categories/products started resolving against genuinely remote databases for the first time.

**Production outcome: 2 of 3 backends are live.** Broadleaf & Co. genuinely runs on Convex in production, confirmed on `/architecture`'s new per-demo table. Northline/MongoDB hit a real, immediately-reverted production incident (`MongoServerSelectionError`, TLS handshake failure) diagnosed as an Atlas Network Access (IP allowlist) restriction -- the same connection string worked flawlessly from this local machine all session, which only makes sense if Atlas's cluster only allows specific already-known IPs, not Vercel's dynamic serverless egress. This is a genuine infra-configuration gap requiring either the user opening Atlas's Network Access list (to `0.0.0.0/0`, matching this project's own public-reference-demo posture, or to Vercel's documented IP ranges) via the Atlas dashboard, or an Atlas Admin API key this session was never given -- not a code fix, and not guessed at further. Production is fully healthy throughout (`DATABASE_URL`/print-shop and Postgres-fallback-for-northline both correct); `NORTHLINE_MONGODB_URL` is reverted out of the live environment until the Atlas access list is fixed, at which point re-adding it is a one-line env var change, not new engineering work.
