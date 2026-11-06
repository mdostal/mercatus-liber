# @mercatus-liber/pdp

Builds the view model for a product detail page: the product, its SKUs, the option values to show, and the resolved layout template.

**Status:** used by the demo stores. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createPdpService } from "@mercatus-liber/pdp";

const pdp = createPdpService({ catalog, theming });

const view = await pdp.getViewModel("mug");
```

`getViewModel(slug, templateOverride?)` loads the page data. `resolveSelection` maps a shopper's chosen option values to a SKU.

## Key exports

- `createPdpService(deps)`: `getViewModel`, `resolveSelection`.
- `computeOptionValues(product, skus)`: the selectable values for each identifying attribute.
- `PdpViewModel`.
- `ProductLookup`: the catalog surface this package needs.

This package renders nothing. It returns data, and the store's UI decides how to draw it.

See [docs/subsystems/04-pdp.md](../../docs/subsystems/04-pdp.md).
