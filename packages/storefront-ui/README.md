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

## Countdowns and sale windows

- `Countdown({ to, now, label?, doneLabel?, onReach? })`: time left until `to` ("2d 4h", "4h 05m", "5m 09s"), ticking every second. Pass the server's render time as `now`: the first render uses it on both sides, so server HTML and hydration match, then the browser ticks on its own clock. `onReach` fires once at zero (e.g. to refresh the page).
- `SaleWindow({ lifecycle, now, timeZone? })`: a badge from `lifecycle()` (`@mercatus-liber/core`): "Opens in ..." with the date before a window opens, "Ends in ..." while it's open (nothing when there's no end), "Ended" with the date after. Nothing for inactive items.
- `formatRemaining(ms)`, `formatWhen(iso, { timeZone })` ("Mon, Nov 30, 12:00 PM CST").

The reference storefront shows `SaleWindow` on product pages in `STORE_TIME_ZONE` (default America/Chicago), and sends a shopper who tries to add an item outside its window back to the product with a notice.
