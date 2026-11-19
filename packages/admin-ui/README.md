# @mercatus-liber/admin-ui

React components for a store's admin screens. Styled with the theming package's CSS variables (`--color-surface`, `--color-text`, `--color-primary`, `--color-danger`, `--color-text-muted`); data and actions come in as props.

**Status:** started 2026-11-19 from shop.mdostal.com's back-print studio. `PrintCoverage` ships now; `ArtVersionEditor`, `OptionMatrixConfigurator` and `RatingsTable` follow. Not yet published to npm; use it from this monorepo via `workspace:*`.

## PrintCoverage

The garment laid flat with a print drawn on it to scale, captioned with how much of the width and length it covers. A print wider than the garment, or running past the hem, is drawn in the danger colour and the caption says it does not fit.

```tsx
import { PrintCoverage } from "@mercatus-liber/admin-ui";

<PrintCoverage garment={{ width: 22, length: 30 }} print={[15, 18]} size="L" />
// "Size L: garment 22 × 30 in flat. The print covers 68% of the width and 60% of the length."
```

Props: `garment` (flat width and length in inches), `print` (inches), `size` (label), `topInches` (gap below the collar, default 3), `maxWidth` (drawing width in pixels, default 260). The maths is `printCoverage` from `@mercatus-liber/print-art`.
