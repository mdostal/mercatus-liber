# Design Discussion — Epic 29: `cms-adapter-discoverability`

## 0. Prelude

**Source:** a direct finding from a fresh gap audit (2026-09-08): `packages/adapter-sanity` is
real, tested code, but `apps/reference-storefront/lib/services.ts` hardcodes the in-memory CMS
adapter with zero env-var branch, and Sanity is mentioned nowhere in `README.md` or anywhere
under `docs/`. It works, but no one setting up a store would ever discover it exists.

## 1. Goal

Wire Sanity as an actual, reachable, documented option in the reference app, the same way
analytics and admin-auth already branch on an env var to pick between a real third-party
service and a zero-infra default.

## 2. Scope decision: services.ts + README only, not create-store's scaffolder

Checked `packages/create-store/src/scaffold.ts`'s generated `services.ts` template: it does
**not generate CMS wiring for any adapter today, not even the in-memory default** — its own
doc comment explicitly says CMS/inventory/analytics/ai-interface wiring "follow the identical
pattern — see `apps/reference-storefront/lib/services.ts` in the main repo for the complete
reference," i.e. create-store's generated starter is deliberately partial (catalog/cart/
theming only) and points elsewhere for the rest. Adding Sanity-specific scaffolding to
create-store when it doesn't scaffold CMS *at all* yet would be a bigger, separate, premature
addition — not what "make an already-built option discoverable" calls for. **Explicitly out
of scope for this epic**, disclosed here rather than silently skipped: a future epic could
teach create-store to scaffold CMS wiring generally (in-memory or Sanity), but that's new
scaffolder capability, not a discoverability fix for something already built.

**What actually fixes discoverability:** the reference app IS the "complete reference" doc
comment above points to. Wiring Sanity into it with the same visible, env-var-branched pattern
every other swappable service in that file already uses (`POSTHOG_API_KEY` → PostHog/no-op,
`CLERK_SECRET_KEY` → Clerk/dev-default) makes it discoverable by the exact mechanism this repo
already uses everywhere else — read `services.ts`, see the branch, see what env vars it reads.
Plus a new README section entry.

## 3. Design decision

`services.ts`'s CMS wiring gains a two-branch shape: `SANITY_PROJECT_ID` (and
`SANITY_DATASET`, `SANITY_TOKEN`) truthy → `createSanityAdapter(...)`, else
`createInMemoryCmsAdapter()` (today's unconditional default, now a real fallback branch rather
than the only option). Zero change to `CmsService`'s own contract — this is purely which
concrete `CmsPersistenceAdapter` gets constructed.

## 4. Version bump

`patch` — a wiring branch and documentation, no new package, no contract change.
