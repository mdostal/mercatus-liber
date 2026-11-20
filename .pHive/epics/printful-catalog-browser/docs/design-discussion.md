# Design discussion: Printful catalog browser, bring-over and placement

Draft 2, 2026-11-20, revised against `grill-record.md` (round 1, 23 findings). Inputs:
`research-brief.md`, `research-raw.md`, the user's ask.

## 1. What are we doing?

The ask, in the user's words: load in all of Printful's items, see them, choose and bring them
over, "and then attempt to get your parts designed", with "at least" back-and-forth linking.

Today a store that sells through Printful does this by hand: the shop repo has pasted variant ids,
hand-picked mockup style ids and one-off print-file scripts. Mercatus Liber already has the back
end of the job (`planPrintfulProduct`/`applyPrintfulProduct`); what's missing is the front end:
seeing the catalog, choosing, and getting art onto the blank.

Deliverable, named plainly (grill V4): library functions in `@mercatus-liber/adapter-printful`,
presentational components in `@mercatus-liber/admin-ui`, and admin pages in the reference
storefront that wire them together. Not a new plugin package.

The work is cut so it can stop after any slice (grill P1, C3). **Slice 1 is the floor the user
named** ("at least see all of the available items ... back and forth linking"). Each later slice
is worth asking about before it starts.

| Slice | What the store owner can do afterwards |
|---|---|
| 1. See | Browse every Printful product (search, filter), open one to see colours, sizes, costs, regions and print areas, and see which are already in the store, with links both ways |
| 2. Bring over | Choose colours, sizes, technique, price and an art file per placement; see cost and margin per SKU; create the product, unpublished, ready to publish |
| 3. Place | See the art drawn on Printful's own template at the true print-area position, check fit, add or change art after bring-over |
| 4. Mock up | Render Printful mockups and save chosen ones as product images |
| 5. Agents (optional) | Browse and bring over from an AI agent through the existing MCP tools |

Not in scope: generating art, a free-form design editor, Printful's Embedded Design Maker (gated
behind enterprise sales), Printful "sync products", other providers' catalogs.

Terms (grill V3): **Printful catalog** = Printful's list of products it can make. A **Printful
product** (Printful calls it a catalog product) is one item in it, e.g. product 71, a Bella+Canvas
3001. A **store product** is ours. **Bring over** = create a store product + SKUs mapped to Printful
variants. I avoid "blank" in code names.

## 2. What I found (after the grill)

- `adapter-printful/src/catalog.ts` reads one Printful product (v2: product, variants, prices),
  estimates costs and creates/reads mockup tasks. No list, no print areas, no 429 handling;
  `http-client.ts` (orders) is a separate client with the same gap (grill H7).
- Printful's public v1 catalog (no token) isn't enough (grill H1): the list has no colours,
  technique keys differ from v2, 317 of 586 products call the front print "default", and variant
  prices aren't split by technique, which cost/margin needs. **So: v2 only, with a token.**
- `products.ts`: plan is pure and reusable; apply is idempotent but overwrites mapping placements
  on every run (grill U2), creates SKUs `active` (catalog `createSku` hard-codes it, service.ts
  L235), and never records the Printful product id in the mapping (grill H2).
- SKUs can be `draft`; the cart refuses any SKU whose status isn't `active` (cart service.ts L68).
  So "brought over but not ready" is safe if its SKUs are draft. That's the gate (grill U1).
- The reference storefront has no product publish action today (grill U1), shares one Postgres
  across demos (grill U4), and scopes products by each demo's Catalog (grill V2).
- `@mercatus-liber/media` only builds image URLs; nothing stores files (grill H3).
- print-art layout ids reject underscores (`layouts.ts` L12), and Printful's sleeve/label
  placements have them (grill H4). adapter-printful must not depend on print-art (grill C2).
- admin-ui depends only on print-art; components take plain data and callbacks. They should not
  import fulfillment (grill C1).
- Mockups: 2 task creations/minute for new stores. Serverless functions can't hold a queue
  (grill H6).

## 3. Proposed approach, by slice

**Slice 1: See (read-only).**
- adapter-printful: `listCatalogProducts({ categoryIds, techniques, placements, search, offset,
  limit })` and `listAllCatalogProducts()` (pages of 100), `listCatalogCategories()`, and a richer
  `getProduct` (techniques, placements, sizes, colours). `getPrintAreas(productId)` from
  `/mockup-styles` (width, height, dpi per placement + technique) and `getMockupTemplates`. Types
  stay Printful-specific (grill C1, P3).
- A shared `printfulFetch` used by both clients: honours 429 `Retry-After` once, then throws
  `PrintfulRateLimitError` (grill H7).
- `createCatalogCache({ ttlMs, load, save })`: in-memory per instance, with optional `load`/`save`
  callbacks so a store can persist the listing (grill H6). The demo commits a JSON snapshot
  instead of calling Printful (see slice 1 demo note).
- In-store links: `applyPrintfulProduct` records `catalogProductId` in each SKU's mapping target
  (additive). `printfulProductsInStore(mappings, catalog)` joins mappings to the store's own SKUs
  (so a demo only sees its own) and returns `{ printfulProductId -> storeProductId[] }` (grill H2).
  Existing mappings without the id are matched by variant id through the listing.
- admin-ui: `ProductGrid` (cards: image, name, brand, badges, "In store" link, "Open on Printful"
  link) with search and filter chips, and `ProductDetail` (colour swatches x sizes with cost and
  region availability, print areas per placement). Plain props; no Printful import in admin-ui.
- Reference storefront: `admin/printful` (grid) and `admin/printful/[productId]` (detail). With
  `PRINTFUL_API_TOKEN` it's live; without one it reads a committed snapshot and says so on the
  page (grill C4, U5).

**Slice 2: Bring over.**
- catalog: `createSku` accepts an optional `status` (default `active`, so nothing changes for
  existing callers).
- `applyPrintfulProduct`: SKUs are created `draft`; placements are merged, not overwritten, when
  the spec has no files for a placement (grill U2); `catalogProductId` recorded.
- `printfulReadiness(productId)`: every SKU has a file for every placement, cost re-estimated with
  the current placements (`estimateCosts`), margin > 0 (grill U3), product has an image. Returns
  the list of what's missing.
- `publishPrintfulProduct(productId)`: refuses unless ready, then sets SKUs and product `active`.
- Fulfillment adapter refuses an item whose target has no placements, before the HTTP call
  (defence in depth; the draft SKU should already have kept it out of the cart).
- admin-ui `BringOverForm`: colours, sizes, technique, retail price + size upcharges, an art URL
  per placement, a live cost/margin table (data from the server's `planPrintfulProduct`).
- Storefront server actions: bring over (adds the product to the demo's Catalog, grill U4/V2),
  publish. In the tokenless demo, bring over still works against the snapshot, SKUs stay draft,
  and the page explains that a token is needed to order. Demo-created products are tagged so the
  demo reset clears them.

**Slice 3: Place.**
- print-art: `layoutsFromPrintAreas([{ key, widthPx, heightPx, dpi }])`, mapping `_` to `-` in ids
  and keeping the original key (grill H4); `createPrintFileHandler` gets a resolver form so layouts
  can come from data (grill H4).
- admin-ui `PlacementPreview`: Printful's template image with the art image positioned by the
  template's print-area top/left/width/height, in CSS; fit/centre/top options. No renderer needed:
  the art is already an image URL (grill H5).
- Storefront: set or change art per placement after bring-over (`setPrintfulArt`).

**Slice 4: Mock up.**
- `requestMockups`/`mockupStatus` server actions; the page asks for one task at a time and waits
  out the rate limit (no in-process queue, grill H6).
- Saving images: an injected `saveImage(url) -> url` (a store wires its own storage). If Printful's
  mockup URLs prove permanent, the default keeps them; to verify first (grill H3).

**Slice 5 (optional): Agent tools** in ai-interface: `printful_search_products`,
`printful_bring_over` (draft only) (grill P2).

## 4. What could go wrong

- **High: selling something that can't be made.** Mitigated by draft SKUs (cart refuses them), the
  readiness check in publish, and the adapter's refusal.
- **High: art lost on re-apply.** Fixed by merging placements; tested.
- **Medium: demo data in a shared database.** Brought-over products must be in the demo's Catalog
  and cleared by its reset.
- **Medium: rate limits.** Grid uses list endpoints only and the cache; detail on demand; 429 handled.
- **Medium: cost drift.** Prices change and placements add cost; readiness re-estimates at publish.
- **Medium: snapshot goes stale** for the tokenless demo. Dated on the page; refresh script.
- **Low: stale status lines** in the adapter-printful README, `22-fulfillment.md` L115-119 and a
  doc comment; fix in slice 1.

## 5. Dependencies and constraints

- A Printful token for anything live (free account; no paid plan). The repo has none.
- Embedded Design Maker stays out (gated, terms unpublished).
- Mockups 2/minute for new stores.
- admin-ui: React 19 peer, inline styles + theme variables, depends only on print-art.
- adapter-printful: depends only on core and fulfillment.
- The shop consumes via vendored tarballs; additive changes only.

## 6. Open questions

1. Stop after slice 1 for you to look, or go straight through slice 2? (I'd stop after 1.)
2. "Get your parts designed": placing your own art files, as planned? Or did you mean more, such as
   generating art?
3. The live demo has no Printful token. Create a free Printful account for the demo (live data,
   placement and mockups visible), or use the committed snapshot (browse and bring-over only)?
4. Should the shop session try slices 1-2 against its real catalog before slice 3?
5. Slice 5 (agent tools): wanted?
6. Embedded Design Maker: leave out, as recommended?

## 7. Verification strategy

- vitest with recorded v2 fixtures (list, product, variants, prices, mockup-styles,
  mockup-templates, mockup tasks, 429), as the existing adapter tests do.
- Re-apply test: art set after bring-over survives `applyPrintfulProduct`.
- Readiness/publish tests: draft SKUs can't be added to a cart; publish refuses until ready.
- admin-ui components in jsdom with `act`.
- Storefront: bring-over action against the in-memory services puts the product in the demo's
  Catalog with draft SKUs; demo reset removes it.
- Live smoke with a token: one list page, one product, one mockup task, one `estimateCosts`;
  no order.

## Grill resolution (round 1)

| Finding | Resolution |
|---|---|
| V1 draft SKUs | SKUs can be draft; `createSku` gains `status`; bring-over creates draft SKUs |
| V2 "place" / which catalog | Bring-over assigns the demo's Catalog; "place" also means art placement (slice 3) |
| V3 "catalog" overloaded | Terms defined in §1 |
| V4 plugin vs adapter | Named: adapter functions + admin-ui components + storefront pages |
| H1 v1 public insufficient | Dropped v1; v2 with token; demo uses a snapshot |
| H2 in-store join | `catalogProductId` in the mapping; join through the store's own SKUs |
| H3 media can't store | Mockup storage via injected `saveImage`; art is a URL in slice 2 |
| H4 layout ids, fixed layouts | `_`->`-` mapping; resolver form of the handler |
| H5 no renderer | CSS positioning of the art URL over the template; no renderer |
| H6 serverless queue/cache | No in-process queue; cache with load/save callbacks |
| H7 no 429 handling | Shared `printfulFetch` with Retry-After |
| U1 unsafe draft | Draft SKUs + readiness + publish action + adapter refusal |
| U2 re-apply overwrites art | Merge placements |
| U3 cost changes | Readiness re-estimates cost |
| U4 demo routing/scope | Demo's Catalog, draft SKUs, reset clears them |
| U5 two sources | One source (v2) + snapshot |
| C1 PodCatalogSource in fulfillment | Dropped; Printful-specific types; admin-ui stays generic |
| C2 adapter-printful -> print-art | `layoutsFromPrintAreas` lives in print-art and takes plain data |
| C3 musings | Slice 1 is the floor; stop-and-ask after it (question 1) |
| C4 showcase | Demo shows browse + bring-over via snapshot; live with a token (question 3) |
| P1 overbuilt | Slices with stop points |
| P2 agent tools | Optional slice 5 (question 5) |
| P3 Printify two-level | Not generalising; Printful-specific |
