# Research brief: Printful catalog browser, import and placement

Date: 2026-11-20. Full notes with line citations: `research-raw.md` (same folder).

## The ask

"A component that lets us load in ALL items from Printful and then a way to place and see the
items and deal with the designs ... or some back and forth linking to at least see all of the
available items in the Mercatus Liber plugin ... so you can choose and bring them over and then
attempt to get your parts designed."

## What exists

| Area | What it does today | Gap for this ask |
|---|---|---|
| `adapter-printful/src/catalog.ts` | One product at a time (v2): product, variants, prices, shipping rates, cost estimates, mockup tasks (create + get, caller polls) | No list of all products, categories, sizes, availability, mockup styles/templates, print-area sizes |
| `adapter-printful/src/products.ts` | `PrintfulProductSpec` -> `planPrintfulProduct` (SKUs, cost, margin) -> `applyPrintfulProduct` (creates product + SKUs + Printful mapping; idempotent) | Leaves products draft with no images; needs print files up front |
| `fulfillment/src/catalog-mapping.ts` | `ProviderCatalogMapping { skuId, provider, target }`, durable in Postgres/SQLite/Mongo/Convex; `list("printful")` | Already enough to mark "in store" items |
| `print-art` | Art versions, pins, `layoutsAtDpi`, `printCoverage`, print-file URL naming + PNG handler | Layouts typed by hand; nothing reads Printful's print areas |
| `admin-ui` | React 19 client components, inline styles + theme variables, data in / actions out (`{ok:false,error}`) | No catalog/provider component |
| `apps/reference-storefront` admin | `app/demo/[demoSlug]/admin/**`, server components + `"use server"` FormData actions with `requireAdminPermission` | No Printful page; Printful adapter only when `PRINTFUL_API_TOKEN` is set; no token in this environment |
| `../shop` (consumer) | Did it all by hand: pasted blank/variant constants, size charts, hand-picked mockup styles, Python print-file builders, mockup scripts respecting 2/min | Evidence of the real workflow this should replace |

## Printful API facts (probed 2026-11-20)

- v2 catalog: every endpoint needs a token (401 without). List paging `limit` 1-100 + `offset`,
  filters for category, colour, placement, technique, region, sort. "All items" is about 6 pages.
- v1 public catalog needs no token: `GET /products` returns all 586 products in one call;
  `GET /products/{id}` gives variants with colour codes, prices, per-region availability and
  placement surcharges. 30 requests/minute unauthenticated. No print-area sizes without a token.
- Print areas for placing art (token): `/v2/catalog-products/{id}/mockup-styles` (print area size
  + dpi, usually 150) and `/mockup-templates` (template image + print area top/left/width/height).
- Mockups (token): `POST /v2/mockup-tasks`, async; 2 creations/minute for new stores (10 after $10
  of fulfilled orders); 20,000 files/day.
- Rate limit v2: 120 requests/60 s, 429 with Retry-After.
- Store "sync products" are v1-only and not used here; this repo orders catalog variant + files.
- Embedded Design Maker (Printful's own designer iframe): gated behind an enterprise sales form
  (operated by Printify, Inc.), terms and price unpublished. Treat as gated/possibly paid.
- Cost: Printful is free to use; you pay for confirmed orders. No API fee found.

## Inconsistency risk signals

- adapter-printful README line 5 says "never called against a live account"; catalog.ts and a later
  README section describe live calls. Stale status line.
- "Design" is ambiguous: placing the store's own art on a blank vs generating art vs Printful's
  designer.
- v1 public data (no token) and v2 data (token) have different shapes; the demo has no token.
- `applyPrintfulProduct` requires files; "bring over first, design later" needs a product with no
  art that must not be orderable or publishable yet.
