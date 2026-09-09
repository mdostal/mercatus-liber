# Getting Started

There are two ways to get hands-on with Mercatus Liber: **run one of the live demo
storefronts** already seeded in this repository, or **provision your own store** with the
`create-store` CLI.

## See it running: the demo storefronts

The `reference-storefront` app (`apps/reference-storefront` in this monorepo) seeds two full
demo storefronts, each a real, browsable route under `/demo/<slug>` — catalog, cart, checkout,
theming, CMS pages, and admin views all included:

- **Dragon Merch** (slug `dragon-merch`) — the default seed, a 3D-print-shop-style catalog.
- **Northline Home Tech** (slug `northline`) — a second, differently themed catalog proving the
  framework isn't hardwired to one look or one kind of product.

Run the reference storefront locally (`pnpm --filter @mercatus-liber/reference-storefront dev`
from the repo root, or `pnpm dev` from inside `apps/reference-storefront`) and visit
`/demo/dragon-merch` or `/demo/northline`. A real, public deployment domain for these demos is
an operational decision outside this documentation site's scope — the same disclosed-gap
posture used for `NEXT_PUBLIC_DOCS_URL` (see the root `README.md`'s Configuration section) — so
no live domain is asserted here.

## Provision your own store: `create-store`

`@mercatus-liber/create-store` is a real, working CLI that scaffolds a new store directory: a
`package.json`, a starter `services.ts`, and a `mercatus-liber.config.json` manifest. It is
**not published to npm yet**, so it has to be run from inside a checkout of this monorepo, not
via `npx`.

### 1. Gather your choices

- **Store name** — used as the directory name and the generated `package.json`'s `name`.
- **Adapter** — one of `sqlite`, `postgres`, or `shopify`.
- **Theme key** — one of `classic`, `dark`, `minimal`, `vibrant`, `retro`, `high-contrast`,
  `northline`.
- **Plugins** (optional) — a comma-separated list; the CLI records these but doesn't otherwise
  validate or act on them today.
- **Target directory** — scaffold into a fresh, empty directory *outside* this repo's own
  working tree.

### 2. Build and run the CLI

From the root of this monorepo checkout:

```bash
pnpm --filter @mercatus-liber/create-store build
node packages/create-store/dist/cli.js <store-name> \
  --adapter <sqlite|postgres|shopify> \
  --theme <key> \
  [--plugins a,b,c] \
  --dir <absolute-path-to-target-dir>
```

The CLI writes `package.json`, `services.ts`, and `mercatus-liber.config.json` into `<dir>` and
refuses to scaffold into a non-empty directory.

### 3. Install and typecheck the scaffold

The generated `package.json` pins `@mercatus-liber/*` dependencies to `^0.1.0` ranges, but those
packages aren't published to npm yet — a plain `pnpm install` against them fails with a 404.
There's also no `devDependencies`, no `tsconfig.json`, and no scripts out of the box. Until
these packages are published, work around it:

1. Edit the generated `package.json` and point each `@mercatus-liber/<pkg>` dependency at this
   checkout instead of the registry, using pnpm's `link:` protocol:
   `link:<absolute-path-to-this-monorepo>/packages/<pkg>`.
2. Add `typescript` and `@types/node` as `devDependencies` (matching this monorepo's versions).
3. Add a minimal `tsconfig.json` mirroring this repo's `tsconfig.base.json` settings.
4. Run `pnpm install` then `npx tsc -p tsconfig.json` — a clean exit confirms the scaffold
   genuinely typechecks against real workspace code.

The full, current step-by-step (including the exact `tsconfig.json` contents) lives in
`.claude/skills/create-store/SKILL.md` in this repository.

### 4. Environment variables your adapter needs

Each adapter reads its own environment variables once you actually run the scaffolded store:

| Adapter | Variable(s) | Notes |
| --- | --- | --- |
| `sqlite` | `DATABASE_PATH` | Optional. Unset (or `:memory:`) runs a transient in-memory database — no setup needed locally, but data doesn't persist across restarts. |
| `postgres` | `DATABASE_URL` | A Postgres connection string. Unset falls back to `pg`'s own default local-connection behavior and will likely fail at runtime, not scaffold time. |
| `shopify` | `SHOPIFY_SHOP`, `SHOPIFY_ACCESS_TOKEN` | Both required. Unset fails at runtime the first time the adapter is used. |

### 5. What's included, and what's a manual follow-up

The scaffold only wires **catalog, cart, and theming**. Checkout/payments, CMS, inventory,
analytics, and the AI/MCP interface all follow the same single-seam pattern (`services.ts` as
the one place that imports a concrete adapter) but are **not** generated — you add them by
hand, using `apps/reference-storefront/lib/services.ts` in this repository as the reference for
how each piece is wired, including which environment variable gates each adapter and its
zero-infra local fallback. That wiring is documented in the root `README.md`'s Configuration
section: `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` / `ADMIN_DEV_PASSWORD` for admin auth,
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` for payments,
`POSTHOG_API_KEY` / `POSTHOG_HOST` / `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` for
analytics, and `SANITY_PROJECT_ID` / `SANITY_DATASET` / `SANITY_TOKEN` for CMS.

Full CLI flag reference (including exactly what each of the three generated files contains):
`packages/create-store/README.md`.
