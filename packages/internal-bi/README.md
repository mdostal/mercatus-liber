# @mercatus-liber/internal-bi

Revenue, order, product, funnel, and promotion metrics computed from your own commerce data, for an admin dashboard.

**Status:** used by the demo stores; a Postgres event log repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createDefaultBiAdapter,
  createInMemoryBiEventLogRepository,
  registerBiEventLogSync,
} from "@mercatus-liber/internal-bi";

const events = createInMemoryEventBus();
const eventLog = createInMemoryBiEventLogRepository();
registerBiEventLogSync({ events, eventLog });

const bi = createDefaultBiAdapter({ orders, skus, promotions, eventLog });
```

## Key exports

- `BiMetricsAdapter`: `getRevenueOverTime`, `getOrderVolume`, `getTopProducts`, `getConversionFunnel`, `getPromotionRedemptionRates`, `getInventoryTurns`. `getInventoryTurns` always resolves `null`, because no inventory history is available to compute it from.
- `createDefaultBiAdapter(deps)`.
- `registerBiEventLogSync({ events, eventLog })`: records bus events for funnel metrics.
- `createInMemoryBiEventLogRepository()`.

## Implementing an adapter

Implement `BiMetricsAdapter` to read from a warehouse instead of the application data.

See [docs/subsystems/20-internal-bi.md](../../docs/subsystems/20-internal-bi.md).
