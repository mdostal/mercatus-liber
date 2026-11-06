# @mercatus-liber/customization-ui

`<ml-finish-color-picker>`, a framework-free Custom Element for choosing a product's finish and colors. It renders state and emits events; it makes no network calls and stores nothing.

**Status:** built and tested, but no reference store renders it, and it still uses hex colors rather than palette ids. For React, use `Customizer` in `@mercatus-liber/storefront-ui`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { defineFinishColorPicker, type FinishColorPickerElement } from "@mercatus-liber/customization-ui";

defineFinishColorPicker(); // registers "ml-finish-color-picker"; pass a name to override

const picker = document.createElement("ml-finish-color-picker") as FinishColorPickerElement;
picker.palette = [{ id: "blue", label: "Blue", hex: "#1F5FD0" }];
picker.finishes = finishes;
picker.product = product;
picker.value = { finishId: "solid", colors: { __all: "#1F5FD0" } };

picker.addEventListener("ml-change", (e) => {
  console.log((e as CustomEvent).detail.value);
});
picker.addEventListener("ml-request", (e) => {
  // detail: { kind, id, productId }. Wire this to your own lead capture.
  console.log((e as CustomEvent).detail);
});
document.body.append(picker);
```

Discontinued options stay visible but disabled. Request-only options show a "Request this" affordance that fires `ml-request`.

## Key exports

- `defineFinishColorPicker(tagName?)`, `FinishColorPickerElement`.
- `getFinishTier`, `paletteEntryByHex`, `resolveEffectiveColor`, `availableColorChoices`, `isRegionLocked`.
- Types: `PaletteColor`, `FinishTier`, `ColorRegion`, `CustomizableProduct`, `ColorSelection`, `FinishColorMode`, `AvailabilityStatus`.

## Relationship to @mercatus-liber/customization

This package has no dependencies and holds its own copy of the resolution logic rather than depending on `@mercatus-liber/customization`. The two have separate types and can drift:

- `ColorRegion` here uses `default`, `parent`, and `allowed`; the server package uses `defaultHex`, `parentRegionId`, and `allowedColorIds`.
- `FinishTier` here has an optional `priceDeltaCents`; the server package prices through `PricingRules` instead.
- The locking logic hardcodes the finish ids `separate` and `finished`.

Map server data to these types yourself, and treat `@mercatus-liber/customization` as the authority: this element's checks are for display only.

See [docs/subsystems/27-customization.md](../../docs/subsystems/27-customization.md).
