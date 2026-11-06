# @mercatus-liber/theming

Layout templates per page type, style tokens, and ready-made theme bundles.

**Status:** used by the demo stores. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { applyTheme, createThemingService, getThemeBundle } from "@mercatus-liber/theming";

const theming = createThemingService();

const bundle = getThemeBundle("dark");
if (bundle) applyTheme(theming, bundle);

const tokens = theming.getTokens();
```

`createThemingService` optionally takes `{ templates, tokens }` to start from your own values instead of `DEFAULT_TEMPLATES`.

## Key exports

- `createThemingService(initial?)`, `ThemingService`: `registerTemplate`, `listTemplates`, `resolveTemplate`, `setDefaultTemplate`, `getConfiguredDefault`, `getTokens`, `setTokens`.
- `DEFAULT_TEMPLATES`.
- `THEME_BUNDLES`, `getThemeBundle(key)`, `applyTheme(theming, bundle)`, `ThemeBundle`. Bundles include `classic`, `dark`, `minimal`, `vibrant`, `retro`, `high-contrast`, and others.

## Extending

Call `registerTemplate` to add layouts, or add your own `ThemeBundle` and pass it to `applyTheme`.

See [docs/subsystems/06-theming-layout.md](../../docs/subsystems/06-theming-layout.md).
