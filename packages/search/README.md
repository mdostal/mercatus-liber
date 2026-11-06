# @mercatus-liber/search

A search index interface, an in-memory index, and a subscriber that keeps the index in step with catalog events.

**Status:** used by the demo stores, on the in-memory index. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryIndex, registerCatalogSearchSync } from "@mercatus-liber/search";

const events = createInMemoryEventBus();
const index = createInMemoryIndex();

registerCatalogSearchSync({ events, index, products });
```

`products` is a `ProductDataLookup` that loads the data to index when a catalog event fires.

## Key exports

- `SearchIndexAdapter`: `index`, `remove`, `query`, `reindexAll`. `reindexAll` replaces the entire index contents.
- `createInMemoryIndex()`.
- `registerCatalogSearchSync({ events, index, products })`.
- `ProductDataLookup`.

## Implementing an adapter

Implement `SearchIndexAdapter` against your search engine and pass it as `index`. The subscriber does not change.

See [docs/subsystems/03-search.md](../../docs/subsystems/03-search.md).
