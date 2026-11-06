# @mercatus-liber/adapter-sanity

A `CmsPersistenceAdapter` for `@mercatus-liber/cms` backed by Sanity.

**Status:** live in production for all three demo stores. Enabled by `SANITY_PROJECT_ID`, with `SANITY_TOKEN` and optional `SANITY_DATASET`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createCmsService } from "@mercatus-liber/cms";
import { createSanityAdapter } from "@mercatus-liber/adapter-sanity";

const persistence = createSanityAdapter({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET ?? "production",
  token: process.env.SANITY_TOKEN!,
});

const cms = createCmsService({ persistence, components });
```

`apiVersion` and `fetchImpl` are optional; `fetchImpl` lets tests run without the network.

## Key exports

- `createSanityAdapter(config)`: returns a `CmsPersistenceAdapter`.
- `SanityAdapterConfig`.
- `SanityApiError`.

See [docs/subsystems/05-cms-pages.md](../../docs/subsystems/05-cms-pages.md) and [integrations.md](../../apps/docs/content-src/integrations.md).
