# @mercatus-liber/storefront-ui

Common React components for a Mercatus Liber storefront. They use the CSS variables from `@mercatus-liber/theming`, and take their data and server actions as props, so they work in any React framework.

**Status:** early. It holds the customizer and price breakdown so far. The other storefront components still live in `apps/reference-storefront/components`, and moving them here is in progress. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```tsx
import { Customizer } from "@mercatus-liber/storefront-ui";

<Customizer
  palette={palette}
  finishes={finishes}
  customization={customization}
  currency="USD"
  quote={quoteAction}
  addToCart={addToCartAction}
/>;
```

`quote` and `addToCart` must run on the server and call `priceLine` from `@mercatus-liber/customization`. The customizer never computes or submits a price itself, so the price shown and the price charged come from the same place.

## Key exports

- `Customizer`: finish, option, color, and name controls with a live price.
- `PriceBreakdown`: an itemized price with a chart of what makes it up.
- `formatMoney`.

See [docs/subsystems/27-customization.md](../../docs/subsystems/27-customization.md).
