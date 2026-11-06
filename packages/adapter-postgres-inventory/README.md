# @mercatus-liber/adapter-postgres-inventory

An `InventoryAdapter` for `@mercatus-liber/inventory` backed by Postgres.

**Status:** live in production for the Print Shop and Northline demo stores, enabled by `DATABASE_URL`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { Pool } from "pg";
import { createPostgresInventoryAdapter } from "@mercatus-liber/adapter-postgres-inventory";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const inventory = await createPostgresInventoryAdapter(pool);

await inventory.setStock("sku-1", 10);
const level = await inventory.getStock("sku-1");
```

You own the `pg.Pool`. The factory creates its table on startup.

## Key exports

- `createPostgresInventoryAdapter(pool)`: returns a `Promise<InventoryAdapter>`.

See [docs/subsystems/11-inventory.md](../../docs/subsystems/11-inventory.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
