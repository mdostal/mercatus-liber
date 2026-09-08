# CMS content adapters — design

Mathew's explicit ask (2026-09-08): "sanity CMS and other parts need to be adapters as well and
wrapped so that we can integrate another CMS systems or design system... and so we should
support and let that work alongside." This epic makes that literally true, mirroring how
`CatalogPersistenceAdapter` proved persistence was swappable (adapter-sqlite → adapter-postgres
→ adapter-shopify).

## What already was, and wasn't, true before this epic

`PageRepository` and `MarketingPageMetaRepository` (subsystem 05) were already narrow,
structurally-typed interfaces — the shape was already adapter-friendly. What was missing:

1. **No single bundled type.** `createCmsService` took `{ pages, marketingMeta, components }` as
   three loose top-level params, unlike catalog's `createCatalogService({ persistence, events })`
   which takes one `CatalogPersistenceAdapter` bundle. There was nothing named
   "the CMS adapter contract" to point at.
2. **No second implementation ever built.** Catalog proved swappability with three real,
   fundamentally different backends (SQLite, Postgres, Shopify). CMS only ever had the
   in-memory reference implementation — an unverified claim, not a proven one.

## What this epic changes

1. **`CmsPersistenceAdapter`** — a new bundled type in `packages/cms/src/types.ts`:
   `{ pages: PageRepository; marketingMeta: MarketingPageMetaRepository }`. `createCmsService`
   now takes `{ persistence: CmsPersistenceAdapter; components: ComponentRegistry }`, exactly
   mirroring catalog's shape. `createInMemoryCmsAdapter()` bundles the existing two in-memory
   repos into one factory, same convenience pattern as adapter-sqlite.
2. **`@mercatus-liber/adapter-sanity`** — a second, fundamentally different `CmsPersistenceAdapter`
   implementation backed by Sanity's real Content API (GROQ queries via the Query API, writes
   via the Mutations API), proving the same swap works for CMS. Same disclosed-gap shape as
   adapter-shopify: injectable fetch client, tested against a stateful recording fake (no live
   Sanity project/token exists in this environment), real implementation written and ready to
   work the moment credentials exist.

## The id question, resolved differently than Shopify

Adapter-shopify had to bridge caller-assigned ids against Shopify's own server-assigned GIDs
via a metafield. Sanity's document model is different: a document's `_id` is caller-specified
at creation time (`createOrReplace` in the Mutations API takes the exact `_id` you give it).
So `Page.id` maps directly to Sanity's `_id` with **no bridging needed at all** — a useful,
honest contrast worth documenting: not every third-party platform has the same "who assigns the
id" seam Shopify has.

## Design systems / visual editors "working alongside"

Mathew also asked about letting Next.js's own visual-editing tooling (the kind that integrates
with the Vercel toolbar) sit alongside this. Nothing about the data contract prevents it: a
`Page`'s `sections: ComponentInstance[]` (`{ componentType, config }`) is already a generic,
render-agnostic shape with no Mercatus-Liber-specific authoring UI baked in. Any visual editor
(Sanity Studio, a Vercel Visual Editing integration, Builder.io, etc.) that can write to
whatever `CmsPersistenceAdapter` is configured — including this epic's `adapter-sanity`, where
Sanity Studio itself IS the natural authoring UI — can serve as the authoring surface. This
epic doesn't build a specific visual-editor integration (that's a real UI project of its own,
out of scope here); it proves the data layer imposes no obstacle to one.

## Disclosed gaps

- No live Sanity project/token exists in this environment — same bar as every other third-party
  adapter in this repo (Stripe, PostHog, Shopify).
- No visual-editor integration is built — the data contract is proven open to one, not
  demonstrated with a real Sanity Studio or Vercel Visual Editing wiring.
- `adapter-sanity` assumes a single Sanity document type per concern (`page`,
  `marketingPageMeta`) with a flat schema; a production deployment's actual Sanity schema design
  (references, portable text, etc.) is a per-deployment concern, not this adapter's job to
  dictate.
