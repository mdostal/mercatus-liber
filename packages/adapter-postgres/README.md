# @mercatus-liber/adapter-postgres

The Postgres backend: a `CatalogPersistenceAdapter` plus repositories for most other subsystems, stored in JSONB columns.

**Status:** live in production for the Print Shop and Northline demo stores. The package's own tests use fake pools rather than a live Postgres. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { Pool } from "pg";
import { createPostgresAdapter, createPostgresCartRepository } from "@mercatus-liber/adapter-postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const persistence = await createPostgresAdapter(pool);
const carts = createPostgresCartRepository(pool);
```

You own the `pg.Pool`. `createPostgresAdapter` runs its schema DDL on startup using idempotent `CREATE ... IF NOT EXISTS` statements.

## Key exports

- Catalog: `createPostgresAdapter`, `createPostgresCatalogRepository`, `createPostgresProductCatalogRepository`, `createPostgresCategoryRepository`, `createPostgresProductCategoryRepository`.
- Shopping: `createPostgresCartRepository`, `createPostgresOrderRepository`, `createPostgresCustomerProfileRepository`, `createPostgresFulfillmentRoutingRepository`.
- Merchandising: `createPostgresPromotionRepository`, `createPostgresBundleRepository`, `createPostgresRecommendationRepository`, `createPostgresCampaignRepository`, `createPostgresStorefrontViewRepository`, `createPostgresServiceAreaRepository`, `createPostgresServiceAreaProductRepository`.
- Community: `createPostgresReviewRepository`, `createPostgresGoalRepository`, `createPostgresGoalVoteRepository`.
- Operations: `createPostgresBiEventLogRepository`, `createPostgresWebhookSubscriptionStore`, `createPostgresWebhookDeliveryLogStore`.

Inventory lives in `@mercatus-liber/adapter-postgres-inventory`.

See [docs/subsystems/00-core-schema.md](../../docs/subsystems/00-core-schema.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
