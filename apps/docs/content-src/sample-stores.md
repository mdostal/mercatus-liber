# Sample Stores

_Last verified 2026-10-15, directly against the running code and a live fetch of each URL
below — `apps/reference-storefront/lib/demos.ts`'s real `DEMO_REGISTRY`, the
`separate-deployed-sample-stores` epic's own story files (both currently `pending`), `npx
vercel project ls` against the real `mathew-dostals-projects` scope, and an actual HTTP
request to each store. This page goes stale the moment any of those things change, so if
you're reading it well after the date above, re-run that same check before trusting a status
below — the same discipline [`/integrations`](/integrations) holds itself to._

Mercatus Liber seeds **three real, distinct demo storefronts** — not placeholders, not the
same catalog re-skinned three times. Each has its own theme, its own catalog, and (this is the
point) its own real persistence backend.

## Today's real shape: three subpaths, one shared deployment

All three run today as `/demo/<slug>` routes of the single shared Vercel project
`mercatus-liber-demo`, live at `commerce.mdostal.com`:

| Store | URL | Backend | Theme | What it demonstrates |
|---|---|---|---|---|
| **The Print Shop** | [commerce.mdostal.com/demo/print-shop](https://commerce.mdostal.com/demo/print-shop) | Postgres (shared Supabase, `DATABASE_URL`) | `editorial` | Embroidery/custom-prints catalog — the default seed. |
| **Northline Home Tech** | [commerce.mdostal.com/demo/northline](https://commerce.mdostal.com/demo/northline) | Postgres (shared Supabase, same `DATABASE_URL`) | `northline` | Smart-home installer catalog — a second, differently themed catalog on the same adapter. |
| **Broadleaf & Co.** | [commerce.mdostal.com/demo/broadleaf](https://commerce.mdostal.com/demo/broadleaf) | Convex (its own deployed project, `kindhearted-corgi-798`) | `vibrant` | Eclectic artisan/handmade-goods catalog — proves the persistence-adapter layer is genuinely swappable per store, not just in theory. |

That per-store backend split is not aspirational — it's real and already live today, fully
disclosed with the exact env vars and test evidence behind it on
[`/integrations`](/integrations)'s Persistence table. Two of the three stores share one
Postgres database; the third runs on a completely independent Convex deployment, in
production, right now.

**Live status, re-checked 2026-10-15 (later same day):** all three return `200` right now.
Print Shop and Northline did go down earlier today with a real `500` — their shared Supabase
Postgres project had gone to sleep (free-tier auto-pause from inactivity), not an application
bug — and have since been recovered. The underlying graceful-degradation handling (an honest
"may be asleep" state instead of a raw error page) and the daily keep-alive/revival job that
prevents recurrence are built in
[`free-tier-resilience-and-keepalive`](/planning/free-tier-resilience-and-keepalive) (epic 79).
Given free-tier backends can still pause again later, re-check live rather than trusting this
paragraph if you're reading it well after this date.

## In progress, not yet live: independent deployments per store

A real, separate epic — [`separate-deployed-sample-stores`](/planning/separate-deployed-sample-stores)
(epic 81) — is building each of these three stores its own independently deployed Vercel
project and its own real domain, instead of all three sharing one deployment behind
`/demo/<slug>`. As of this verification pass that work has **not landed**: both of its stories
(`ss-01-single-tenant-mode`, the env-gated single-tenant rewrite; `ss-02-three-deployments-and-linking`,
the actual Vercel projects, Clerk wiring, and cross-linking) are still `status: pending`, and
`npx vercel project ls` against the real `mathew-dostals-projects` scope shows no
`mercatus-liber-print-shop`, `mercatus-liber-northline`, or `mercatus-liber-broadleaf` project
yet — only the existing shared `mercatus-liber-demo` and `mercatus-liber-docs`. The `/demo/<slug>`
links above are the real, current way to reach each store; this section will be rewritten with
three independent URLs once that epic actually ships, not before.

## See also

- [Getting started](/getting-started) — how to run these same three demos locally, or
  provision your own store with `create-store`.
- [Integrations](/integrations) — the full real/live status of every backend, CMS, auth,
  payments, fulfillment, and analytics integration behind these stores, including the exact
  env var(s) that activate each one.
- [Planning corpus](/planning-index) — the real design-discussion behind this page
  ([`docs-wiki-examples-architecture`](/planning/docs-wiki-examples-architecture), epic 80),
  the free-tier resilience fix (epic 79), and the separate-deployments epic (epic 81).
