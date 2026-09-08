# Deploy tool + auto-update — scope and disclosed gaps

Epic 16 is the commercial thesis: a one-command installer to stand up a store on a client's own
infrastructure (not just Mathew-hosted), plus an auto-update mechanism for security/maintenance
patches. This is what makes "$1,000 one-time setup, remove folks from Shopify" (client Cadex)
operable at more than one client without ongoing hand-holding.

## What ships in this epic

- **`@mercatus-liber/create-store`** — a scaffolder: `scaffoldStore({ targetDir, storeName,
  adapter, theme, plugins })` generates a new project directory with a `package.json` declaring
  the chosen subsystem packages as dependencies, a minimal wiring entry point demonstrating the
  same `lib/services.ts` composition pattern the reference storefront uses, and a
  `mercatus-liber.config.json` manifest recording every choice made (adapter, theme, plugins,
  and the exact package versions installed) -- the substrate the auto-update tool reads.
- **`@mercatus-liber/auto-update`** — reads that manifest, checks each `@mercatus-liber/*`
  dependency's installed version against an injectable registry client's "latest" answer,
  reports available updates, and (`applyUpdates`, gated behind a caller-supplied `runTests`
  check) only commits a version bump if the target project's own test suite still passes
  afterward -- rolling back the `package.json`/manifest change otherwise. This is the actual
  "safe for unattended maintenance" property the commercial thesis depends on.

## Disclosed gaps (same bar as every other adapter in this repo)

- **No full Next.js app template.** The scaffolder generates the wiring layer (package.json,
  service composition entry point, manifest) -- not a complete copy of every page/component
  `apps/reference-storefront` has. A production version would template the full app; that's
  additional content-generation scope, not a new architectural pattern, and is a documented
  follow-up rather than fabricated here.
- **No live npm registry integration test.** These packages are not yet published to npm (see
  the backlog's own "Longer-term destination" note -- most of this work is intended to
  eventually move under Pantheon). `checkForUpdates` is fully implemented and tested against an
  injectable `RegistryClient`; the real `createNpmRegistryClient` implementation is written and
  will start resolving real versions the moment these packages are published. Same disclosed-gap
  shape as the Stripe adapter's mocked SDK, adapter-postgres's fake pool, and adapter-shopify's
  fake store.
- **`runTests` is caller-supplied, not opinionated about a specific test runner.** `applyUpdates`
  takes a `(targetDir) => Promise<boolean>` function -- the real CLI's default implementation
  shells out to `pnpm test`, but any deployment target's actual test command can be substituted.
- **No auto-update scheduling/daemon.** This ships the safe apply-or-rollback mechanism, not a
  cron/systemd-timer wrapper that runs it unattended on a schedule -- that's an ops-layer
  concern for whatever hosts a deployed store, not this package's job.
