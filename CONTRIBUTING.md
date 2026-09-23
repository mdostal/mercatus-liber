# Contributing to Mercatus Liber

Mercatus Liber is built to be a genuinely community-developed alternative to the commercial
commerce-platform stack (Shopify/BigCommerce/WooCommerce-class systems) — see `VISION.md` for
the full "why." That only works if outside contributions are actually easy to make. This
document is the real, current answer to "how do I contribute," grounded in this repo's actual
tooling — not generic boilerplate.

## Before you start

- Read `README.md` for the architecture (adapter-first, no subsystem imports another
  subsystem's internals — see the "Prime directive" section) and `docs/ARCHITECTURE.md` for the
  full rule this repo is built around.
- Read `VISION.md`, specifically the **"Wanted, not started — the community plugin frontier"**
  table. That table is the single best place to find something worth building: wishlist,
  backorder/pre-order, gift cards, subscriptions, loyalty, multi-currency, returns/RMA,
  marketplace sync, and more, each with a one-line scope and a contribution shape. Each one is a
  standalone package or adapter, buildable without touching the core.
- Check `.pHive/planning/epic-backlog.md` for whether something's already scoped into a numbered
  epic before starting work on it, so you don't duplicate in-flight work.

## Development setup

This is a pnpm workspace monorepo (`pnpm-workspace.yaml`: `packages/*` + `apps/*`), built with
[Turborepo](https://turbo.build). Requirements: Node >= 20, pnpm (the repo pins
`packageManager: pnpm@11.22.0` in `package.json` — use that version via `corepack`).

```
git clone https://github.com/mdostal/mercatus-liber.git
cd mercatus-liber
pnpm install
```

Nothing else is required to get most of the repo building and testing. Individual
apps/adapters have their own optional environment variables (real database URLs, Stripe keys,
Clerk keys, Sanity project IDs, etc.) — every one of them has a documented, harmless fallback
so the repo runs with zero external accounts. See `README.md`'s "Configuration" section for the
full, verified list (each entry there was confirmed by grepping `process.env` in the actual
app, not written from memory) and `apps/reference-storefront/README.md` for that app
specifically.

To run the reference storefront locally:

```
pnpm --filter @mercatus-liber/reference-storefront dev
```

## The standing full-check command

Before opening a PR, run the same command this project's own history runs before every merge:

```
pnpm turbo run typecheck test build --force
```

This runs typecheck, test, and build across every package and app in the workspace (Turbo
handles the dependency ordering via each `turbo.json` task's `dependsOn`). `--force` skips
Turbo's cache so you get a real, from-scratch result rather than a stale cache hit. A PR that
doesn't pass this clean, for the packages it touches at minimum, isn't ready for review.

Package-scoped equivalents (useful while iterating, faster than the full run):

```
pnpm --filter @mercatus-liber/<package-name> test
pnpm --filter @mercatus-liber/<package-name> typecheck
pnpm --filter @mercatus-liber/<package-name> build
```

Tests run on [Vitest](https://vitest.dev) (`vitest run` per package's own `test` script — see
any `packages/*/package.json`). There's no single root-level Vitest config; each package/app
runs its own suite, orchestrated by Turbo.

## The adapter pattern — how most contributions are shaped

The core rule (`docs/ARCHITECTURE.md`, "Prime directive: no tight coupling"): every subsystem
that could plausibly have more than one implementation is a **narrow structural TypeScript
interface**, with a zero-infra reference default living in the subsystem's own package and real
third-party integrations living in **sibling `adapter-*` packages**. A subsystem depends on the
interface, never a concrete adapter. Only the app composition layer
(`apps/reference-storefront/lib/services.ts`) is allowed to import a concrete adapter package —
that's the one rule every adapter contribution has to respect.

Concretely, adding a new adapter (payments, CMS, persistence, fulfillment, shipping, whatever)
looks like:

1. Find the interface you're implementing. Persistence adapters implement
   `CatalogPersistenceAdapter` from `@mercatus-liber/core`; other subsystems export their own
   equivalent (e.g. `@mercatus-liber/cms`'s CMS-persistence interface,
   `@mercatus-liber/payments`'s payment-adapter interface). Read the interface's own type
   definitions and doc comments before writing anything — they're the actual contract.
2. Look at an existing adapter of the same kind as a real, working reference.
   `packages/adapter-sqlite` and `packages/adapter-postgres` are good starting points for a
   persistence adapter (two genuinely different storage models — TEXT-encoded JSON vs. JSONB —
   proving the interface doesn't secretly assume a particular encoding); `packages/adapter-shopify`
   for wrapping a whole third-party commerce backend; `packages/adapter-printful` /
   `packages/adapter-printify` / `packages/adapter-shippo` for fulfillment/shipping providers.
3. Your adapter's public surface should be **exactly** the interface it implements — no
   provider-specific types leaking out. If you find yourself wanting to export something extra,
   that's usually a sign the interface itself needs to grow (open an issue to discuss that
   first, since it's a core-package change, not an adapter-only one).
4. Ship a real `package.json` (`build`/`typecheck`/`test`/`lint` scripts, matching every
   existing package's shape), real tests (Vitest, not placeholder assertions — this repo's own
   convention is regression tests that prove real behavior against real seeded data, not mocks
   of the subsystem under test), and a README documenting what env vars/credentials it needs and
   what it does differently from the existing reference adapter(s).
5. If a real third-party credential/account is required to fully verify your adapter live (the
   way Printful/Printify/Shippo/GA4/Cloudinary currently are in this repo — see `VISION.md`'s
   "Still open, blocked on something real" section), that's fine: build and unit-test it
   correctly against the provider's current real docs, and say plainly in your PR description
   that live verification is blocked on a credential you don't have. Don't claim it works
   end-to-end if you haven't actually run it against the real provider.

A non-adapter contribution (a genuinely new subsystem, e.g. wishlist or gift cards from
`VISION.md`'s community-frontier table) follows the same shape one level up: its own package
under `packages/`, its own narrow interface if it needs to be swappable, its own tests, wired
into `apps/reference-storefront/lib/services.ts` only at the composition layer.

## Pull request expectations

- One logical change per PR. If you're implementing something from `VISION.md`'s
  community-frontier list, say which line item in the PR description.
- `pnpm turbo run typecheck test build --force` passes clean for anything you touched (ideally
  the whole workspace — Turbo's caching makes a full run cheap after the first one).
- New code has real tests. This repo does not merge untested behavior changes.
- No subsystem package imports another subsystem's internals, and no adapter package's public
  surface leaks provider-specific types past the interface it implements — see "The adapter
  pattern" above. If your change needs to cross that boundary, that's a sign it belongs at a
  different layer.
- Keep the diff scoped to what the PR is actually about. This repo's own convention (see
  `.pHive/planning/epic-backlog.md` for examples) is to explicitly check `git diff --stat` against
  the target branch before merging, to confirm the change touched only what it claims to.
- Use the PR template (`.github/PULL_REQUEST_TEMPLATE.md`) — it's the same checklist above, in
  checkbox form.

## Where to ask questions

[GitHub Issues](https://github.com/mdostal/mercatus-liber/issues) is the real, live channel for
this project today — bug reports, feature proposals, and "is anyone working on X" questions are
all welcome there. There's no chat/Discord/forum yet, and GitHub Discussions isn't enabled on
this repo at the moment; Issues is genuinely it. If you want to work on something from
`VISION.md`'s community-frontier table, opening an issue first (even a short one) is the best
way to avoid duplicated effort, since there's no other coordination mechanism in place yet.

## A note on how the maintainer works

You don't need any of this to contribute, but in case you're curious why some directories look
the way they do: this project's own maintainer uses an internal planning convention
(`.pHive/` — epics broken into stories, tracked in `.pHive/planning/epic-backlog.md`, with a
`design-discussion.md` per epic). It's an internal workflow tool, not a contribution
requirement — you don't need to touch `.pHive/` or follow its format to send a PR. If you're
curious what it looks like in practice, `apps/docs`'s "Planning" section publishes every epic's
real design-discussion doc, so the reasoning behind past decisions is public, not just the
one-line backlog summary.

## License

By contributing, you agree your contribution is licensed under this project's MIT license (see
`LICENSE`).
