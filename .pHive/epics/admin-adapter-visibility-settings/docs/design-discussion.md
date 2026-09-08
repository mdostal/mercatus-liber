# Design Discussion — Epic 25: `admin-adapter-visibility-settings`

## 0. Prelude

**Source:** the 2026-09-08 hand-off brief's second goal, final item: "a settings page showing
which concrete adapter is active for each swappable subsystem (persistence, CMS, payments) --
visibility into 'how this instance is actually running,' which is the whole 'adapters and
options for how it runs' pitch made concrete in the UI itself." This is the last epic in the
entire hand-off brief's scope — epics 20-24 are all merged to master.

## 1. Goal

An `/admin` page showing, plainly, which concrete adapter this running instance chose for
persistence, CMS, and payments (plus one bonus row, see §4), and whether each is actually
configured.

## 2. Research findings (grounding)

- **`apps/reference-storefront/lib/services.ts` is the sole composition root** — its own
  header comment states it's "THE ONLY MODULE IN THIS REPO that imports concrete adapter
  implementations." Today: persistence is a hardcoded `createSqliteAdapter(":memory:")`
  (`services.ts:136`, no env branching at all); CMS is a hardcoded
  `createInMemoryCmsAdapter()` (`services.ts:241-244`, no env branching); payments always
  constructs a real Stripe adapter (`createLazyStripeAdapter`, `services.ts:109-120,145-149`),
  but its key is env-driven — `process.env.STRIPE_SECRET_KEY ?? ""` — so "configured vs. not"
  is a real, observable runtime fact for this one subsystem specifically.
- **No adapter in this repo self-identifies.** `CatalogPersistenceAdapter`,
  `CmsPersistenceAdapter`, and `PaymentAdapter` are all bare structural interfaces (products/
  skus/attributes; pages/marketingMeta; createPaymentSession/confirmPayment/handleWebhookEvent)
  with zero name/label/kind field anywhere, confirmed across every concrete implementation
  (adapter-sqlite, adapter-postgres, adapter-shopify, the in-memory CMS default,
  adapter-sanity, the Stripe adapter). This is deliberate, not an oversight — the docs
  (`docs/subsystems/00-core-schema.md`, epic 18's own design doc) frame adapter-agnosticism as
  the whole point; an adapter that knew its own name would be a small crack in that.
- **The one counterexample: plugins.** `packages/plugins`'s `Plugin` interface *requires* a
  `name: string` field, and the existing `/admin/plugins` page trivially renders
  `plugins.list().map(p => p.name)` — genuine dynamic introspection, because plugins are
  designed to self-identify. Persistence/CMS/payment adapters are designed the opposite way on
  purpose. This page **cannot** copy that mechanism.
- **Conclusion: this must be a small, explicit, manually-maintained descriptor built at the
  app-composition layer**, not a new capability any package-level interface needs to grow.
  The only place that knows which concrete factory was called is `services.ts` itself (or a
  sibling module reading the same environment).
- **No `.env.example` exists in this repo.** The only documented env-var-per-adapter
  convention lives in `packages/create-store/src/scaffold.ts` (for scaffolding *new*,
  separate deployments) — this app's own `services.ts` doesn't read `DATABASE_URL`/
  `SANITY_PROJECT_ID`/etc. at all today. The settings page reports what's **actually wired in
  this instance**, not a hypothetical menu of every adapter that could theoretically exist.

## 3. The design question, resolved: an app-layer descriptor module, no new subsystem/package

**Decision: no new `packages/*` subsystem.** Unlike epics 20-24, this isn't a reusable
cross-deployment domain capability — it's metadata about *this one app's own composition
choices*, which by the architecture's own rule only ever lives in `services.ts`. Inventing a
package for it would be a package with exactly one real consumer and no adapter-swappability
of its own (a "settings registry adapter contract" would be self-parodying — the thing being
described has no self-description to abstract over).

**What gets built instead:** `apps/reference-storefront/lib/adapter-info.ts`, exporting
`getAdapterInfo(): AdapterInfo[]` where
`AdapterInfo = { subsystem: string; adapter: string; detail: string; status: "active" |
"unconfigured" }`. Each entry is written by hand, next to the actual `create*Adapter(...)`
call it describes, so the descriptor can never silently drift from reality the way a
fully-decoupled config file might — a reviewer changing which adapter `services.ts` wires in
sees the descriptor update in the same diff, the same discipline every prior epic in this wave
used for its own decoupling-verification comments.

**Required three rows** (per the backlog's explicit scope): persistence, CMS, payments.
**One bonus row**: analytics — already a real, env-driven two-branch swap
(`POSTHOG_API_KEY` truthy → PostHog, else a no-op adapter, `services.ts:131-133`) that costs
nothing extra to report and materially strengthens the "how this instance is actually running"
pitch the brief asks for. Documented here as a deliberate, small scope extension, not creep —
it reuses data this page needs to read anyway (env var presence) and required no new code path
to compute.

## 4. `/admin/settings` page

Plain, read-only Server Component, matching `/admin/plugins`'s minimal shape exactly (the
closest existing precedent for "list what's currently active," even though the underlying
mechanism differs) — a `<table>` of subsystem / adapter / detail / status, no CRUD, no forms.

## 5. Scope

**Small.** Two stories: the descriptor module, and the page + admin-nav link + closeout. This
epic doesn't warrant the four-story shape every domain-model epic in this wave used — a
smaller, honestly-scoped epic is the correct call here, not padding for consistency's own sake.

## 6. Version bump

`patch` — a new read-only introspection page and one new small app-layer module; no new
package, no change to any existing subsystem's public contract.
