# @mercatus-liber/create-store

Scaffolds a new deployable Mercatus Liber store: a `package.json` wired to a chosen persistence
adapter, a minimal service-composition entry point (`services.ts`), and
`mercatus-liber.config.json` (the manifest `@mercatus-liber/auto-update` reads). This is the
deploy-tool half of the commercial thesis -- see this package's own `package.json` description
and `.pHive/epics/deploy-tool-and-auto-update/docs/deploy-tool-scope.md`.

## Usage

```
create-mercatus-liber-store <store-name> --adapter <sqlite|postgres|shopify> --theme <key> [--plugins a,b,c] [--dir <path>]
```

Confirmed against the CLI's real, current argument parsing (`src/cli.ts`) -- not paraphrased
from any older doc.

**Flags:**

- `<store-name>` -- positional, required. Also used as the `name` field of the generated
  `package.json`.
- `--adapter <sqlite|postgres|shopify>` -- required. Selects which persistence adapter package
  the generated `services.ts` imports and constructs. There is no default; omitting it prints
  the usage string and exits with a non-zero status.
- `--theme <key>` -- required. Must be one of the valid theme bundle keys (see below). There is
  no default; omitting it prints the usage string and exits with a non-zero status. Passing an
  unknown key fails at scaffold time with `InvalidThemeError` before any file is written.
- `--plugins a,b,c` -- optional, comma-separated plugin list. Defaults to an empty list. Recorded
  in `mercatus-liber.config.json`'s `plugins` field; the CLI does not otherwise validate or act on
  plugin names today.
- `--dir <path>` -- optional. The directory to scaffold into. Defaults to
  `<current working directory>/<store-name>`. `scaffoldStore` creates the directory if it doesn't
  exist, and refuses to scaffold into a non-empty directory (`TargetDirNotEmptyError`) unless the
  caller passes `overwrite: true` to the underlying `scaffoldStore()` API -- the CLI itself
  exposes no flag for this, so from the CLI a non-empty target directory always fails safely
  rather than silently overwriting content.

Every flag is parsed as `--key value` pairs (`src/cli.ts`'s `parseArgs`); there is no `--flag`
(boolean, no-value) form and no `-h`/`--help` flag -- running with no arguments, or with a
required flag missing, prints the usage string above to stderr and exits with status 1.

## The three adapter choices

Each adapter needs its own environment variables once you actually run the scaffolded store --
these are read directly by the generated `services.ts` (confirmed from `src/scaffold.ts`'s
`generateServicesFile`), not by this CLI itself:

- **`sqlite`** (`@mercatus-liber/adapter-sqlite`) -- constructs
  `createSqliteAdapter(process.env.DATABASE_PATH ?? ":memory:")`.
  - `DATABASE_PATH` -- optional. Path to a SQLite database file. Unset (or `":memory:"`) runs
    against a transient in-memory database -- no setup needed to run locally, but data does not
    persist across restarts.
- **`postgres`** (`@mercatus-liber/adapter-postgres`) -- constructs a `pg` `Pool` from
  `process.env.DATABASE_URL` and awaits `createPostgresAdapter(pool)`.
  - `DATABASE_URL` -- required for real use. A Postgres connection string. If unset, `pg`'s
    `Pool` is constructed with `connectionString: undefined`, which falls back to `pg`'s own
    default local-connection behavior (typically `libpq` env vars / local socket) rather than
    failing at scaffold time -- expect connection errors at runtime, not scaffold time, if no
    Postgres instance is reachable.
- **`shopify`** (`@mercatus-liber/adapter-shopify`) -- constructs
  `createShopifyAdapter({ shop: process.env.SHOPIFY_SHOP!, accessToken: process.env.SHOPIFY_ACCESS_TOKEN! })`.
  - `SHOPIFY_SHOP` -- required. Your Shopify shop domain.
  - `SHOPIFY_ACCESS_TOKEN` -- required. A Shopify Admin API access token. Both are asserted
    non-null (`!`) in the generated code -- if either is unset, expect a runtime failure the
    first time the adapter is actually used, not a scaffold-time error.

None of these four variable names appear in the main repo README's "Configuration" section --
that section documents `apps/reference-storefront`'s own app-level environment variables
(admin auth, payments, analytics, CMS), which are a separate, later concern from the adapter
your scaffolded store's `services.ts` constructs directly. See "What's not included" below for
how those two layers relate.

## Valid theme keys

The full, current list of `--theme` values, from `packages/theming/src/theme-bundles.ts`'s
`THEME_BUNDLES` array (grep for `key:`):

| Key | Label |
| --- | --- |
| `classic` | Classic |
| `dark` | Dark |
| `minimal` | Minimal |
| `vibrant` | Vibrant |
| `retro` | Retro |
| `high-contrast` | High Contrast |
| `northline` | Northline |

Each bundle is a grouping of CSS custom-property tokens (`--color-background`, `--color-text`,
`--color-primary`, `--color-accent`, `--font-family`, `--radius`) plus per-page-type default
template keys, applied via `applyTheme()` -- pure sugar over `ThemingService`'s existing
`setTokens`/`setDefaultTemplate` methods, not a parallel theming mechanism. `northline` was
added for the epic-15b public demo (Northline Home Tech) and is a real, usable theme like any
other, not demo-only scaffolding.

## What a scaffold produces

Given a successful run, `<dir>` contains exactly three files:

- **`package.json`** -- `name` (the store name), `version: "0.1.0"`, `private: true`,
  `type: "module"`, and a `dependencies` object: the chosen adapter package plus
  `@mercatus-liber/core`, `@mercatus-liber/catalog`, `@mercatus-liber/cart`,
  `@mercatus-liber/checkout-orders`, and `@mercatus-liber/theming`, all pinned to `^0.1.0` (the
  version every package in this monorepo currently ships at -- see the `PACKAGE_VERSION_RANGE`
  comment in `src/scaffold.ts`). The `postgres` adapter additionally adds `pg@^8.13.0`. There are
  **no `devDependencies`, no `scripts`, and no `tsconfig.json`** -- a fresh scaffold is not yet
  independently buildable/typecheckable; see the SKILL.md procedure
  (`.claude/skills/create-store/SKILL.md`) for how to add what's needed to verify one.
- **`services.ts`** -- a single `buildServices()` async function wiring an in-memory event bus,
  the chosen adapter as `persistence`, a catalog service, a cart service (backed by an in-memory
  cart repository), and a theming service with the chosen theme bundle applied. Its own doc
  comment discloses exactly what it is: **a starting point covering catalog/cart/theming wiring
  only** -- not a full copy of the reference storefront's composition. See "What's not included"
  below.
- **`mercatus-liber.config.json`** (`MANIFEST_FILENAME` in `src/manifest.ts`) -- the manifest
  `@mercatus-liber/auto-update` reads to know what's installed: `storeName`, `adapter`, `theme`,
  `plugins`, `packageVersions` (mirrors `package.json`'s `dependencies`), and `generatedAt` (an
  ISO 8601 timestamp).

## What's not included (the disclosed gap)

The generated `services.ts` carries its own doc comment saying this plainly: it is **a starting
point covering catalog/cart/theming wiring, not a full copy of the reference storefront's
composition**. Checkout/payments, CMS, inventory, analytics, and AI-interface wiring all follow
the identical single-seam pattern (`services.ts` as the one place that imports a concrete
adapter) but are **not** generated -- you add them by hand, following
`apps/reference-storefront/lib/services.ts` in this repo as the complete reference for how each
piece is wired (which env var gates which adapter, and its zero-infra local fallback). That
file's wiring is documented in the main repo `README.md`'s "Configuration" section -- e.g.
`CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`ADMIN_DEV_PASSWORD` for admin auth,
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` for payments, `POSTHOG_API_KEY`/`POSTHOG_HOST`/
`NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST` for analytics, and
`SANITY_PROJECT_ID`/`SANITY_DATASET`/`SANITY_TOKEN` for CMS.

Also not included, as noted above: no `devDependencies` (no `typescript`, no `@types/node`), no
build/typecheck `scripts`, and no `tsconfig.json`. And because `@mercatus-liber/*` packages are
not yet published to npm (see `PACKAGE_VERSION_RANGE`'s comment in `src/scaffold.ts`), a plain
`pnpm install` against the generated `package.json`'s `^0.1.0` ranges will fail to resolve them
from the registry today -- see the SKILL.md procedure for the local workaround.

## Running the CLI in this monorepo today

`@mercatus-liber/create-store` is not published to npm yet, so `npx create-mercatus-liber-store`
does not work today. From a checkout of this monorepo:

```
pnpm --filter @mercatus-liber/create-store build
node packages/create-store/dist/cli.js <store-name> --adapter <adapter> --theme <key> [--plugins a,b,c] --dir <path>
```

See `.claude/skills/create-store/SKILL.md` for the full agent-facing procedure, including how to
get a freshly scaffolded store installing and typechecking despite the packages not being
published yet.
