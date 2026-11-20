# Grill Record — printful-catalog-browser

**Source draft:** `.pHive/epics/printful-catalog-browser/docs/design-discussion.md` (Draft 1, 2026-11-20)
**CONTEXT.md substrate:** present (`.pHive/CONTEXT.md`, plus `.pHive/cross-cutting-concerns.yaml` and the user's memory notes)
**inconsistency_risk_signals:** present (`research-brief.md` "Inconsistency risk signals")
**round_number:** 1
**unresolved_count:** 23
**Generated:** 2026-11-20T22:10:08Z

Evidence below was read from the working tree on branch `feat/printful-catalog-browser` (read-only), plus two no-token probes of Printful's public v1 API on 2026-11-20 (`GET /products`, `GET /products/71`, `GET /categories`).

## Summary

- Vocabulary mismatches: 4 findings
- Hidden assumptions: 7 findings
- Unresolved tensions: 5 findings
- Convention violations: 4 findings
- Posture mismatches: 3 findings

## Vocabulary mismatches

- **V1** — "Draft SKUs" (and "the product starts as a draft") contradicts how the catalog defines status. Only a Product can be `draft`. `createSku` always writes `status: "active"`, and `PrintfulCatalogWriter.createSku` has no status input.
  - Draft location: line 20 ("The product starts as a draft"), line 89 ("creates draft SKUs whose mapping has no placements"), lines 120-121 ("SKUs a shopper could buy if someone publishes too early")
  - Reference: `packages/catalog/src/service.ts:235` (`createSku` sets `status: "active"`); `packages/adapter-printful/src/products.ts:81` (writer's `createSku` input has no status); `packages/cart/src/service.ts:68` (cart checks only `sku.status`, never the product's)
  - Question for planner: Does "draft" mean the product status, a new SKU status set through `updateSku`, or both? Which one does the readiness rule actually gate?

- **V2** — The user's "a way to place and see the items" is read only as Printful *placement* (art on a print area). In this repo, placing a product also means putting it in a Catalog or marketing catalog (CONTEXT.md "Marketing catalog"). The demos scope products by `Catalog` membership. The draft never says where a brought-over product is placed in the store.
  - Draft location: line 21 ("Get the design onto it ... per placement"), lines 107-109 (`PlacementEditor`); section 1 has no step for assigning a category or catalog
  - Reference: `.pHive/CONTEXT.md` ("Marketing catalog"); `apps/reference-storefront/lib/demos.ts:65-69, 113-122` (`DEMO_CATALOG_SLUG`, `listProductsForDemo` via `listProductsInCatalog`)
  - Question for planner: Did the user mean placing art, placing the product into the store's catalog or categories, or both? If both, which step of "bring over" assigns the Catalog or category?

- **V3** — "Catalog" carries at least five meanings in the draft and repo: Printful's catalog, the proposed `PodCatalogSource` and `createCachedCatalogSource`, fulfillment's `catalog-mapping`, `@mercatus-liber/catalog` (the store's products), the existing `/admin/catalog` page, and CONTEXT.md's "Marketing catalog". "Blank" is the draft's main noun and is not in the glossary. Next to CONTEXT.md's "Product", it is unclear whether a `PodBlank` is ever a Product.
  - Draft location: lines 63-71 (`PodCatalogSource`, `PodBlank*`), line 80 (`createCachedCatalogSource`), line 112 (`admin/printful/**` next to the existing `admin/catalog`)
  - Reference: `.pHive/CONTEXT.md` Terminology; `apps/reference-storefront/app/demo/[demoSlug]/admin/catalog/page.tsx`
  - Question for planner: Which names will the glossary hold ("blank", "provider catalog", "POD catalog source"), and should CONTEXT.md gain entries so stories don't drift?

- **V4** — The user asked to see the items "in the mercatus liber plugin". In this repo a plugin is a specific thing: `@mercatus-liber/plugins` (a named object with `init` that subscribes to events), plus the admin `/plugins` page that lists registered plugins. The draft delivers library functions, admin-ui components and storefront pages, and never says whether the result is a plugin, an adapter, or neither.
  - Draft location: lines 12-13 ("library code plus admin components any store wires in"), section 3 overall
  - Reference: `packages/plugins/README.md:1-20`; `docs/subsystems/12-plugins-extensibility.md` ("Every adapter interface ... IS a plugin point"); research-raw A6 (admin `plugins` page lists `plugins.list()`)
  - Question for planner: What did "plugin" mean to the user: an adapter package, a registered `Plugin`, an admin surface, or the MCP/agent tools? Should the design name which one it delivers?

## Hidden assumptions

- **H1** — The draft assumes the public v1 source can fill the neutral types and feed "plan" and "bring over as draft". v1 does not return several of the fields the plan depends on. Verified today against the live v1 API:
  - `GET /products` items have `title` (not `name`), `type_name`, `main_category_id` (an id only; names come from a separate `/categories` call), `techniques` and `files`, and **no colours**. So `PodBlankSummary.colourCount` (line 65) can't be filled without 586 detail calls at 30 requests/minute unauthenticated.
  - Technique keys are uppercase (`DTG`, `EMBROIDERY`, `DTFILM`) where v2 and `PrintfulProductSpec.technique` use `dtg`.
  - The front placement's id is `default` on 317 of 586 products (its `type` is `front`). v2 calls it `front`.
  - A v1 variant has one `price` ("13.92") and no per-technique price. `planPrintfulProduct` → `printfulUnitCostCents` needs `PrintfulPrices.variants[].techniques[]` and placement prices keyed by `technique_key`, and throws when they are missing.
  - Nothing establishes that a v1 variant `id` equals the v2 `catalog_variant_id` that orders are sent with. A draft brought over in the demo would store a v1 id as `catalogVariantId`.
  - Draft location: lines 55, 64-68, 77-79 ("Lets the demo and a store without a token browse and plan ... (`printArea` optional)"), lines 112-114
  - Why this matters: "browse, plan, bring over as draft" without a token (line 113) depends on cost, technique and variant-id equivalences that are unverified or false. The only mismatch the draft admits is the missing print area.
  - Question for planner: Which neutral fields are optional for the v1 source (colour count, category name, per-technique cost)? Will v1 ids be confirmed as v2 catalog variant ids, with a test that proves it, before any mapping is written from v1 data?

- **H2** — "`list("printful")` gives the 'already in store' set for free, keyed by catalog variant id" (lines 42-44) assumes the grid can join on variant ids. That join doesn't work:
  - The mapping target stores only `catalogVariantId` and `placements`, with no Printful product id (`products.ts:124-131`).
  - The grid is one tile per blank, and neither list endpoint returns variant ids, so marking a blank "in store" needs a variant→product lookup per mapped SKU.
  - The mappings table is one shared table for all three demos, built once in `services.ts:1055` with no demo scoping, while products are scoped per demo by Catalog (`demos.ts:113-122`). A blank brought over in northline would show "in store" in print-shop.
  - Draft location: lines 15-16, 42-44, 102-103, 25-26
  - Why this matters: the "in store" badge and back-links (goal 6) would be wrong or expensive in the reference storefront.
  - Question for planner: Should the mapping target also record `printfulProductId` (and the store product id)? How is "in store" scoped to one demo or store when the mappings table is shared?

- **H3** — The draft assumes `@mercatus-liber/media` can save mockups. It can't: it is a URL-transform interface only (`ImageAdapter.resolveUrl`, string construction, "never" fetches). Nothing in the repo uploads or stores files. The same gap covers "an uploaded file" as art: Printful needs a public URL for every file (`products.ts:19`), and nothing in the design hosts one.
  - Draft location: lines 21, 97-99 ("copied to the store's own media first"), 107, 125-126, 142-143 ("Store media adapter (`@mercatus-liber/media`) for saving images")
  - Why this matters: two of the six goals (art from an uploaded file; mockups that keep working after Printful's URLs expire) have no storage under them.
  - Question for planner: Is a new storage port in scope (and which provider; free or paid, per the memo on paid services)? Or should goal 4 drop "uploaded file" and goal 5 keep Printful's URLs until the expiry question is answered?

- **H4** — The draft assumes print-art layouts can be derived from Printful placements. print-art rejects them as they are. `layoutsAtDpi` throws on any id outside `^[a-z0-9][a-z0-9.x-]*$`, which excludes underscores. Printful placement keys use underscores (`sleeve_left`, `embroidery_chest_left`, `label_inside`; v1 `/products/71`). `createPrintFileHandler` also takes one fixed `layouts` record when it is built, and a print-file name carries only the layout id. Per-blank sizes ("front" is a different size on different blanks) would need ids that are unique across every blank a store sells, and a handler whose layouts can grow.
  - Draft location: lines 45-47, 94-95 (`layoutsFromPlacements`)
  - Evidence: `packages/print-art/src/layouts.ts:12, 18`; `packages/print-art/src/files.ts:61-66`
  - Why this matters: "files at exactly Printful's size" fails at the first sleeve or label placement. The store's print-file route would also need rebuilding for each product brought over.
  - Question for planner: What is the layout id scheme (blank + placement + size?), and does print-art's handler need to change to look layouts up dynamically?

- **H5** — `PlacementEditor` "see it drawn on Printful's template image ... pure SVG/CSS, no API call" assumes admin-ui can draw a print-art version. It can't: print-art has "No rendering code: the store supplies the renderer". A version is an opaque `copy: T`, and the only image is the rendered print file, which takes 3.2 s on first render. The reference storefront imports neither admin-ui nor print-art (research-raw A6), and Printful mockups need the art at a publicly reachable URL, which localhost isn't.
  - Draft location: lines 21-22, 107-109, 112-114
  - Evidence: `packages/print-art/package.json` description; `packages/print-art/src/files.ts:47, 58`
  - Why this matters: the preview needs a rendered URL per (art, layout) pair, and the reference storefront would need its own art store, renderer and print-file route before placement works at all.
  - Question for planner: Where do the preview image and the public print-file URL come from in the reference storefront, and does that wiring belong to this epic?

- **H6** — The draft assumes a mockup queue limited to 2 per minute (line 97) and an in-memory catalog cache (line 80) behave sensibly inside Next.js server actions and serverless functions. A 10-variant mockup job takes about 5 minutes at 2 per minute. An in-memory TTL cache is per instance and empty on every cold start. The draft doesn't say where queue state lives or who polls.
  - Draft location: lines 80-82, 97-99, 110-111
  - Why this matters: the queue may be cut off mid-run by the function time limit, or two admin tabs or instances may each send their own 2 per minute and trip the 429s the queue exists to avoid.
  - Question for planner: Is the queue client-driven (the browser polls and requests one task at a time) or server-persisted? Is the account's real per-minute limit (2 or 10) read from Printful or configured?

- **H7** — "Honour 429 Retry-After in the shared client" (line 83) and "they share its HTTP and error handling" (lines 37-38) assume a shared client exists. `catalog.ts` has its own `request()` (line 107), separate from `http-client.ts`, which handles orders. Neither handles 429 or Retry-After today (grep finds no match). The draft also counts "about 6 pages" of v2 list for "load ALL", but v2's total is unverified without a token (research-raw B, "Total v2 catalog count: not verified").
  - Draft location: lines 36-38, 74-75, 83
  - Why this matters: retry would have to be added in two places, or the clients merged first. Changing the order client's error behaviour reaches into order submission.
  - Question for planner: Should both clients share one request layer as an explicit first step, and should retries stay out of order submission?

## Unresolved tensions

- **U1** — The draft says draft products can't be bought until a publish action checks readiness (lines 88-93, 120-122). The code has three gaps:
  - SKUs are always `active`, and the cart checks only SKU status (`cart/service.ts:68`). A brought-over draft product's SKUs can be added to a cart by id (MCP `add_to_cart`, store-api) whether or not the product is published.
  - The storefront has **no product publish action** today. `catalog.publishProduct` is called only from seed files (`seed.ts:646` and others; `actions.ts` has no publish-product action). The "publish action refuses" step is new code, and `CatalogService.publishProduct` (`catalog/src/service.ts:193`) stays callable from anywhere without the check. The catalog can't check Printful readiness without breaking the decoupling rule.
  - The fallback refusal in the fulfillment adapter runs at `submitOrder`, after the customer has paid (`actions.ts:1012` → `fulfillment/src/service.ts:171`). It turns an unready product into a paid order that fails.
  - Draft location: lines 88-93, 120-122
  - Tension: "bring over before art" makes the product exist with buyable SKUs, but the only guards are at publish, which nothing enforces, and at fulfilment, which is after money moves.
  - Question for planner: Is the guard SKU status (create SKUs inactive until ready), a check at add-to-cart or checkout, or does bring-over wait until art exists (open question 3)? Which layer owns it without the catalog importing Printful?

- **U2** — `setPrintfulArt` writes files into each SKU's mapping (line 96). `applyPrintfulProduct` is idempotent and rewrites every mapping's `placements` from `spec.files` each time it runs (`products.ts:124-131`). Running bring-over again with the original no-art spec, for example to add a colour or with `updatePrices`, would erase the art.
  - Draft location: lines 40-41 ("feed it, not replace it"), 86-89, 96
  - Tension: "reuse plan/apply unchanged" against a second writer of the same mapping field.
  - Question for planner: Which record is authoritative for a product's art: the spec, the mappings, or a new per-product record? Must apply preserve existing placements when the spec has none?

- **U3** — The cost and margin table is computed at bring-over (lines 19, 104-106), but the cost depends on placements. With no files, `printfulUnitCostCents` charges only the base price (`catalog.ts:214-225`). Adding a back print later adds that placement's price (+5.95 on product 71, v1 `/products/71`). Prices are set when SKUs are created, and apply keeps them unless `updatePrices` is passed.
  - Draft location: lines 19, 89-91 ("positive margin" in readiness), 104-106
  - Tension: margin is shown before the inputs that decide it exist. After art is set, the stored price can be below cost.
  - Question for planner: Must placements (not art) be chosen at bring-over so cost is right? Does setting art recompute margins and prompt a price change?

- **U4** — "With no token it uses the public source (browse, plan, bring over as draft)" (lines 112-114) conflicts with how the demo is wired:
  - `applyPrintfulProduct` routes each SKU to `"printful"` (`products.ts:132`), but without a token no Printful adapter is registered (`services.ts:1149-1150`). Any order for those SKUs then throws `NoAdapterForProviderError` (`fulfillment/src/service.ts:105`).
  - The three demos share one Postgres database (memory `project_mercatus-liber-flayr-integration.md`, "demos sharing one Postgres database"). Brought-over products are not assigned to the demo's `Catalog`, so they don't appear in `/admin/catalog` (`listProductsForDemo`), and the per-catalog reset won't clean them up.
  - `getProductBySlug` is global, so slugs can collide across demos.
  - Draft location: lines 112-114, 138-139, 170-171
  - Tension: a "demo works without a token" promise against writes that the live shared database and routing can't handle cleanly.
  - Question for planner: In the tokenless demo, should bring-over be preview-only (plan, no apply)? If it writes, which Catalog does it assign, and how does reset clean up?

- **U5** — Two sources, a public v1 one and a v2 one (lines 73-79), exist mainly so the demo works without a token. The draft rates the shape drift between them as the first High risk (lines 118-119), and open question 6 (lines 159-160) offers the alternative: give the demo a token. Each other provider adapter is credential-gated and says so (`adapter-printful/README.md:5`, fulfillment README "credential-gated").
  - Draft location: lines 73-79, 118-119, 138-139, 159-160
  - Tension: permanent cost of maintaining two mappings, against a free token (subject to the user's sign-up rule).
  - Question for planner: If the user approves a demo token, is the v1 source still needed? If not, can its scope shrink to "browse only" with no plan or apply?

## Convention violations

- **C1** — The draft puts `PodCatalogSource` and the `PodBlank*` browsing types in `@mercatus-liber/fulfillment`, which conflicts with that package's stated scope: "Per-order-line fulfillment routing and status". `catalog-mapping.ts` is there only as the order-time lookup for "which provider product each SKU is made from" (`22-fulfillment.md:69-74`). Browsing blanks, colours and print areas is about sourcing products, not routing orders. Two further effects:
  - admin-ui's only dependency is `@mercatus-liber/print-art` (`admin-ui/package.json`), so components typed on `Pod*` would pull fulfillment into admin-ui.
  - The existing precedent is provider-specific catalog clients in each adapter (`adapter-slant3d/src/catalog.ts`, `adapter-3dapi/src/catalog.ts`, `adapter-printful/src/catalog.ts`), with no neutral interface.
  - Draft location: lines 63-71 ("I'm putting it in fulfillment because that's where provider mappings already live")
  - Convention: `packages/fulfillment/package.json` description; `docs/subsystems/22-fulfillment.md:3-4`; `.pHive/cross-cutting-concerns.yaml` `subsystem-decoupling`
  - Question for planner: Align (types in the adapter, or in a new small package that admin-ui can depend on) or deviate with a rationale? Will 22-fulfillment.md's scope be amended?

- **C2** — Layer C lives "in `adapter-printful`, using print-art" (line 85), and `layoutsFromPlacements` returns print-art `PrintLayout`s (lines 94-95). adapter-printful depends only on core and fulfillment, and its own comments call that "the same narrow-dependency discipline every other adapter in this repo follows".
  - Draft location: lines 85, 94-95
  - Convention: `packages/adapter-printful/package.json` (dependencies, description); `packages/adapter-printful/src/mapping.ts` (comment on `PrintfulRecipientAddress`: "this package depends on `@mercatus-liber/fulfillment` only"); `cross-cutting-concerns.yaml` `subsystem-decoupling`
  - Question for planner: Return a structural `{ id, inches, px }` shape that print-art accepts without the import, or add the dependency on purpose and record why?

- **C3** — Memo "Musings are not build requests": pin an ambiguous go-ahead to one specific thing, and prefer the cheapest, most clearly requested one. The ask is hedged ("or some back and forth linking to **at least** see all of the available items", "attempt to get your parts designed **and whatever else**"). The draft commits to the maximal reading (six goals, four layers) and leaves the smallest reading only as open questions 2 and 7.
  - Draft location: lines 12-29, 61, 147-161
  - Convention: `memory/feedback_dont-build-on-musings-or-paid-services.md` ("How to apply", bullet 3)
  - Question for planner: Which slice is the clearly requested one: browse plus link plus bring over? Should the user confirm the design, placement and mockup layers before they are planned into stories?

- **C4** — Memo "Multi-backend showcase": adapter work should be visible live on the demos, not only present in code. As drafted, the live demo shows only the tokenless v1 browse, and placement and mockups are invisible to anyone looking at the site (lines 112-114, 159-160). The draft doesn't connect this to the showcase intent.
  - Draft location: lines 112-114, 138-139, 159-160
  - Convention: `memory/feedback_multi-backend-showcase.md`
  - Question for planner: Is a live demo of placement and mockups part of "done" (which needs the token decision in open question 6), or is a browse-only demo accepted on purpose?

## Posture mismatches

- **P1** — Overbuild against the ask. The draft adds infrastructure the user didn't mention: provider-neutral types, two API sources with a contract suite, a pluggable cache with `snapshot()`/`restore()`, a readiness system, and a rate-limited mockup queue. It names no smallest useful stopping point. Line 61 says "each slice ends in something usable" but no slice is defined as enough.
  - Draft location: lines 61-114, 147-161
  - Posture reference: the user's verbatim ask ("or ... at least see all of the available items"); `memory/feedback_dont-build-on-musings-or-paid-services.md`
  - Question for planner: What is the first slice that alone answers "at least see all items and bring them over"? Which layers are deferred until the user asks for them?

- **P2** — Possible underbuild. The ask is about seeing and choosing items "in the mercatus liber plugin", and this repo exposes admin operations to agents through `@mercatus-liber/ai-interface` (MCP `create_product` and `update_product`, `packages/ai-interface/src/tool-definitions.ts:121-137`). The draft offers only React admin components and storefront pages: no tool to list or search blanks, and no tool to bring one over. The shop session, which did all of this by hand with scripts (research-raw A7), would gain nothing usable from an agent session.
  - Draft location: section 3 D (lines 101-114); section 1 goals 1-6
  - Posture reference: `docs/subsystems/14-ai-mcp-interface.md`; `packages/ai-interface/src/tool-definitions.ts`
  - Question for planner: Should browse and bring-over also be agent tools (read-only browse at least), or is that left out on purpose?

- **P3** — Provider-neutral types (lines 63-71, open question 1) are justified by "Printify can later". The repo's own fulfillment doc says Printify product and print-provider selection "happens entirely in Printify's own dashboard/catalog setup, upstream of this adapter", and that it is out of scope. Printify's catalog has two levels (a blueprint, then a print provider, each with its own variants and costs). A single-id `PodBlank` doesn't model that. `adapter-printify` has no catalog client at all (`src/` has no `catalog.ts`). The abstraction is designed against one implementation and one unexamined future one.
  - Draft location: lines 63-71, 149-150
  - Posture reference: `docs/subsystems/22-fulfillment.md:227-236`; `packages/adapter-printify/src/` file list
  - Question for planner: Is neutrality worth it before a second implementation exists? If so, has the neutral shape been checked against Printify's blueprint and print-provider model, or the 3D-print catalogs (slant3d, 3dapi)?

## Notes

- The README status line the brief flags (`adapter-printful/README.md:5`, "never called against a live Printful account") is still stale. So is `docs/subsystems/22-fulfillment.md:115-119`, which says `services.ts` throws for `resolveCatalogTarget`; `services.ts:1164` now wires `printfulCatalogTargetsFrom`. The docs concern in `cross-cutting-concerns.yaml` applies to both.
- `createPrintfulFulfillmentAdapter`'s doc comment (`adapter-printful/src/index.ts`, about line 147) still says no live token exists, while `catalog.ts:6` cites live responses. Another stale-status signal of the same kind.
- The units claim in the draft (line 127) checks one value from the shop (product 12, DTG front 1800x2400 at 150 dpi). That figure came from the v1 `printfiles` endpoint (research-raw A7), not from v2 `mockup-styles`, so the planned test compares two different endpoints.
- Verified today: `GET /products` returns 586 products in one call, and `GET /categories` is public (200). Not verified: v2 totals and v2 field names (no token).

## Out of scope (this pass)

Grill does NOT propose solutions, score quality, gate work, or prioritize findings. Each finding ends with a question for the planner; the planner's job is to revise the draft (or document accepted deviations) before stories are written.
