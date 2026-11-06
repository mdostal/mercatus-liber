# @mercatus-liber/storefront-ui

Common React components for a Mercatus Liber storefront. They use the CSS variables from `@mercatus-liber/theming`, and take their data and server actions as props, so they work in any React framework.

**Status:** partial. It holds the customizer, price breakdown, and the cart and product page templates. Navigation, home, category, and CMS components still live in `apps/reference-storefront/components`. Not yet published to npm; use it from this monorepo via `workspace:*`.

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

## Cart and product page templates

Templates take where the store lives and its server actions as props, so they aren't tied to one app's routes:

```tsx
import { CartStandard } from "@mercatus-liber/storefront-ui";

<CartStandard store={{ basePath: "" }} actions={{ updateCartItemQuantity, removeCartItem, applyCoupon, startCheckout }} {...cart} />;
```

`store.formFields` adds hidden fields to every form, for actions that need them.

## Key exports

- `Customizer`: finish, option, color, and name controls with a live price.
- `PriceBreakdown`: an itemized price with a chart of what makes it up.
- `CartStandard`, `CartSpecTable`, `CartReceiptStyle`.
- `PdpTabbedDetail`, `PdpLongScroll`, `PdpSpecSheet`, `VariantPicker`.
- `StoreContext`, `CartActions`, `PdpActions`.
- `formatMoney`.

See [docs/subsystems/27-customization.md](../../docs/subsystems/27-customization.md).
