---
name: create-store
description: Provision a new Mercatus Liber store by running the create-store CLI in this monorepo, verifying the scaffold actually installs and typechecks, and reporting the follow-up environment variables and manual wiring the human still needs to do.
---

## Overview

`@mercatus-liber/create-store` is a real, working CLI that scaffolds a new store directory
(`package.json`, a starter `services.ts`, and a `mercatus-liber.config.json` manifest). It is
not published to npm yet, so it must be run from inside this monorepo checkout. Its generated
`services.ts` only wires catalog/cart/theming -- CMS/payments/inventory/analytics/ai-interface
wiring is a manual follow-up. This procedure has been dry-run end to end (scaffold, install,
typecheck) and every step below is confirmed to work as written, not aspirational.

Full CLI reference: `packages/create-store/README.md`.

## Steps

### 1. Gather the required choices

Ask whoever is asking for a store:

- **Store name** (used as the directory name and `package.json` `name`).
- **Adapter**: one of `sqlite`, `postgres`, or `shopify`.
- **Theme key**: one of `classic`, `dark`, `minimal`, `vibrant`, `retro`, `high-contrast`,
  `northline` (the full current list -- reconfirm against
  `packages/theming/src/theme-bundles.ts` if this skill file is old, since new themes may have
  been added since).
- **Plugins** (optional): a comma-separated list, or none.
- **Target directory**: where to scaffold to. Default to a fresh directory outside this repo's
  own working tree (e.g. under the store name in the user's home directory or a scratch
  location) unless the human says otherwise -- never scaffold into this repo's own checkout.

### 2. Build and run the CLI locally

These packages are not published to npm, so `npx create-mercatus-liber-store` will not work.
From the root of this monorepo checkout:

```bash
pnpm --filter @mercatus-liber/create-store build
node packages/create-store/dist/cli.js <store-name> --adapter <sqlite|postgres|shopify> --theme <key> [--plugins a,b,c] --dir <absolute-path-to-target-dir>
```

The build step is cheap to re-run even if `dist/` already exists (confirms you're running current
source). The CLI writes `package.json`, `services.ts`, and `mercatus-liber.config.json` into
`<dir>` and prints a one-line confirmation. It refuses to scaffold into a non-empty directory
(fails with `TargetDirNotEmptyError`) -- pick an empty or new path.

### 3. Install and typecheck the scaffold

The generated `package.json` pins `@mercatus-liber/*` dependencies to `^0.1.0` semver ranges, but
those packages are **not published to npm today** -- a plain `pnpm install` against them will
fail with a 404 from the registry. It also ships with no `devDependencies`, no `tsconfig.json`,
and no scripts, so there's nothing to typecheck with yet. Work around all three like this:

```bash
cd <target-dir>
```

a. **Point the `@mercatus-liber/*` dependencies at this checkout instead of the registry.** Edit
   `package.json` and replace each `@mercatus-liber/<pkg>` version with
   `link:<absolute-path-to-this-monorepo-checkout>/packages/<pkg>` (pnpm's `link:` protocol
   symlinks a local directory as if it were an installed package -- no publish required). The
   adapter package name maps to its own directory (`@mercatus-liber/adapter-sqlite` ->
   `packages/adapter-sqlite`, `@mercatus-liber/adapter-postgres` -> `packages/adapter-postgres`,
   `@mercatus-liber/adapter-shopify` -> `packages/adapter-shopify`); the always-present core
   packages map the same way (`@mercatus-liber/core` -> `packages/core`,
   `@mercatus-liber/catalog` -> `packages/catalog`, `@mercatus-liber/cart` -> `packages/cart`,
   `@mercatus-liber/checkout-orders` -> `packages/checkout-orders`, `@mercatus-liber/theming` ->
   `packages/theming`). Leave any non-`@mercatus-liber` dependency (e.g. `pg` for the `postgres`
   adapter) untouched -- it's a real published package and installs normally.

b. **Add `typescript` and `@types/node` as `devDependencies`** (the scaffold doesn't include
   them) -- match the versions this monorepo's root `package.json` uses (`typescript@^7.0.2`,
   `@types/node@^22.7.5`) so behavior matches the rest of the repo.

c. **Add a minimal `tsconfig.json`** (the scaffold doesn't include one either) -- mirror this
   monorepo's `tsconfig.base.json` settings:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "lib": ["ES2022"],
       "types": ["node"],
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "noEmit": true
     },
     "include": ["services.ts"]
   }
   ```

d. **Install and typecheck:**

   ```bash
   pnpm install
   npx tsc -p tsconfig.json
   ```

   A clean run (exit code 0, no output) confirms the scaffold genuinely typechecks against real
   workspace code, not just "files exist." If this monorepo ever publishes these packages to npm
   (see `packages/create-store/src/scaffold.ts`'s `PACKAGE_VERSION_RANGE` comment), step (a)'s
   `link:` rewrite becomes unnecessary and a plain `pnpm install` will work directly.

### 4. Report back to the human

Tell the human:

- Which environment variables their chosen adapter needs to actually run against real data,
  pulled from `packages/create-store/README.md`'s "The three adapter choices" section (sourced
  from the CLI's own code, not memory):
  - `sqlite` -- `DATABASE_PATH` (optional; unset/`:memory:` runs a transient in-memory database).
  - `postgres` -- `DATABASE_URL` (a Postgres connection string; unset falls back to `pg`'s own
    default local-connection behavior and will likely fail at runtime, not scaffold time).
  - `shopify` -- `SHOPIFY_SHOP` and `SHOPIFY_ACCESS_TOKEN` (both required; unset fails at
    runtime the first time the adapter is used, since both are non-null-asserted in the
    generated code).
- That the scaffold only wires catalog/cart/theming. Checkout/payments, CMS, inventory,
  analytics, and AI-interface wiring are a **manual follow-up** the human (or the agent, on
  request) adds to the generated `services.ts` by hand, using
  `apps/reference-storefront/lib/services.ts` in this repo as the reference for how each piece
  is wired -- including which environment variable gates each adapter and what its zero-infra
  local fallback is (documented in this repo's root `README.md`'s "Configuration" section:
  `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`ADMIN_DEV_PASSWORD` for admin auth,
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` for payments,
  `POSTHOG_API_KEY`/`POSTHOG_HOST`/`NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST` for
  analytics, `SANITY_PROJECT_ID`/`SANITY_DATASET`/`SANITY_TOKEN` for CMS).

## Notes

- Never scaffold into this repo's own working tree -- always an external/scratch directory, or
  wherever the human's real project should live.
- Step 3's `link:` rewrite and the added `tsconfig.json`/`devDependencies` are a today-only
  workaround for these packages not being published yet; don't treat them as "the real
  scaffolder's design" -- they belong to the setup/verification procedure, not to what
  `scaffoldStore` itself generates.
- If `--theme` is passed an unknown key, `scaffoldStore` throws `InvalidThemeError` before
  writing any files -- validate the theme key against
  `packages/theming/src/theme-bundles.ts` before running the CLI if there's any doubt.
