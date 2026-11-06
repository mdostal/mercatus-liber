# @mercatus-liber/service-areas

Geographic service areas with their own pages and product assignments, for local businesses.

**Status:** used by the demo stores; Postgres repositories ship in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  createInMemoryServiceAreaProductRepository,
  createInMemoryServiceAreaRepository,
  createServiceAreaService,
} from "@mercatus-liber/service-areas";

const areas = createServiceAreaService({
  areas: createInMemoryServiceAreaRepository(),
  assignments: createInMemoryServiceAreaProductRepository(),
});

const area = await areas.getServiceAreaBySlug("downtown");
```

## Key exports

- `createServiceAreaService(deps)`: `createServiceArea`, `getServiceArea`, `getServiceAreaBySlug`, `listServiceAreas`, `assignProductToServiceArea`, `unassignProductFromServiceArea`, `listServiceAreasForProduct`, `listProductIdsInServiceArea`.
- `createInMemoryServiceAreaRepository()`, `createInMemoryServiceAreaProductRepository()`.
- `ServiceAreaNotFoundError`.

See [docs/subsystems/15-service-areas.md](../../docs/subsystems/15-service-areas.md).
