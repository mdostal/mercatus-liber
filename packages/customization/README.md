# @mercatus-liber/customization

Finish tiers, color palettes, per-region color rules, art styles, and itemized build pricing for made-to-order products. It validates a shopper's choices server-side and turns them into a priced list of lines.

**Status:** built and tested, not wired into the demo stores. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { resolvePrice, type PricingRules } from "@mercatus-liber/customization";

const rules: PricingRules = {
  basePriceCents: { solid: 5900, ams: 8300 },
  attributes: [
    { id: "customName", label: "Custom name", perUnitCents: 400 },
    { id: "accent", label: "Contrast accent", perUnitCents: 300 },
    { id: "longName", label: "Long name", perUnitCents: 50 },
  ],
  contrastRules: [{ attributeId: "accent", regions: ["lid"], core: ["body"] }],
  excessUnitRules: [{ attributeId: "longName", source: "nameLength", freeUnits: 8 }],
};

const price = resolvePrice(rules, {
  finish: "ams",
  attributeCounts: { customName: 1 },
  colors: { body: "navy", lid: "gold" },
  nameLength: 11,
});
// price.lines is itemized; price.total is in cents; price.quoteRequired is a boolean
```

`createPricingService({ rules })` stores `PricingRules` per product and exposes the same calculation as `priceOf(productId, build)`, throwing `MissingPricingRulesError` when a product has none.

## How pricing works

- **Base:** `basePriceCents[finish]`, or 0 if the finish has no entry.
- **Attributes:** `count * perUnitCents`, only for attributes listed in `rules.attributes`. A `quoteOnly` attribute adds no line and sets `quoteRequired`.
- **`ContrastRule`:** adds one unit when any listed region's color differs from all `core` colors.
- **`ExcessUnitRule`:** derives a count as `round(max(0, source - freeUnits) * (unitsPerExcess ?? 1))`. `source` is `estimatedMinutes` (from `rules.estimatedMinutes[finish]`), `colorChanges` (distinct `build.colors` minus one), or `nameLength`.
- **`colorMarkupCents`:** charged once per distinct color.
- Zero-amount lines are omitted and the total never falls below the base. Pass effective colors in `PriceBuild.colors`, not the raw selection.

## Availability status

`PaletteColor`, `FinishTier`, and `ArtStyle` take an optional `status`:

- `active`: the default when missing.
- `discontinued`: rejected server-side with `InvalidColorSelectionError`, `DiscontinuedFinishError`, or `DiscontinuedArtStyleError`.
- `request`: selectable; the host app decides how to capture the request.

## Key exports

- `createCustomizationService(deps)`: palette, finish, art style, and product customization CRUD, plus `resolveEffectiveColors`, `getRegionChoices`, `getColorCount`, `validateArtStyleChoice`.
- Pure functions: `validateRegions`, `resolveEffectiveColor`, `availableColorChoices`, `validateSelectedColor`, `resolveColorCount`, `resolvePrice`.
- `createInMemoryPaletteRepository`, `createInMemoryFinishTierRepository`, `createInMemoryArtStyleRepository`, `createInMemoryProductCustomizationRepository`, `createInMemoryPricingRulesRepository`.

## Known limitations

- Palette identity is matched by hex, so two palette entries sharing a hex count as one color.
- The selection and `resolveEffectiveColors` output are hex values, while `colorMarkupCents` is keyed by palette id. Markups only apply if the caller passes palette ids in `PriceBuild.colors`.
- A `colorChanges` rule compares raw strings, so use one consistent form and casing in `PriceBuild.colors`.
- Repositories for customization are in-memory only.
- There is no options or variants support yet.

See [docs/subsystems/27-customization.md](../../docs/subsystems/27-customization.md).
