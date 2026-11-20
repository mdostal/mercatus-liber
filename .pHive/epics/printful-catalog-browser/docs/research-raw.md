# Printful catalog browser / import / design: research (2026-11-20)

Repo: /Users/mdostal/Documents/work/personal/mercatus-liber (branch feat/address-normalization; adapter-printful files are modified in the working tree, so line numbers are for the working copy). Read-only research, no repo files edited.

## A. Existing code

### A1. packages/adapter-printful
Endpoints already called (all v2, all Bearer token + optional `X-PF-Store-Id`):
- `src/catalog.ts` `createPrintfulCatalogClient` (L103-195):
  - `GET /v2/catalog-products/{id}` -> `getProduct` (L145). Typed fields: id, name, brand, model, type, image, description, is_discontinued (L16-25). No placements/techniques/sizes typed.
  - `GET /v2/catalog-products/{id}/catalog-variants?limit=100&offset=` -> `listVariants`, follows paging (L146-154). Variant: id, size, color, color_code, image (L27-35).
  - `GET /v2/catalog-products/{id}/prices?limit=100&offset=` -> `getPrices`, pages by variant (L155-165). Placement prices plus per-variant technique prices (L37-41).
  - `POST /v2/shipping-rates` (L166-172), `GET /v2/webhooks` (L173-175).
  - `POST /v2/order-estimation-tasks` + poll `GET ?id=` up to 20 s -> `estimateCosts`, no order created (L127-144).
  - `POST /v2/mockup-tasks` -> `createMockupTasks` (L176-190); `GET /v2/mockup-tasks?id=` -> `getMockupTasks` (L191-193). No polling helper; the caller polls.
  - Pure helpers: `printfulPriceToCents` (L198), `printfulUnitCostCents` (L214, assumes the most expensive placement is the included one, L211-212).
- `src/http-client.ts`: orders only: `POST /v2/orders`, `POST /v2/orders/{id}/confirmation`, `GET /v2/orders/{id|@external}`, `GET .../shipments` (L71-88).
- `src/products.ts`: `PrintfulProductSpec` (L11-28: slug, title, printfulProductId, technique, files[{placement,url}], colors, sizes?, pricing). `planPrintfulProduct` (L55-74) pure, gives SKUs + cost + margin + unavailable pairs. `applyPrintfulProduct` (L103-135) creates product (identifying keys color/size), SKUs, saves the mapping, routes the SKU to printful. Idempotent; it does NOT set images or publish the product (it stays `draft`).
- Not present: catalog listing (`GET /v2/catalog-products` list), categories, sizes, availability, images, mockup-styles, mockup-templates, placement print-area dimensions, files API, store/sync products, product templates, EDM.
- Exports (`src/index.ts` L8-26): everything from printful-types, catalog, products, mapping; PrintfulApiError, webhook helpers, PRINTFUL_PROVIDER; `createPrintfulFulfillmentAdapter` (L152); `printfulCatalogTargetsFrom(repo)` (L223).
- README "Running a Printful catalog" (README.md L62-79) documents the spec -> plan -> apply flow. Inconsistency: README L5 says it was "never called against a live Printful account", but catalog.ts L6 says fields were read from live v2 responses on 2026-11-06 and README L89 cites a real `POST /v2/orders` 400. The README status line is stale (not edited; flag only).
- Ordering model: catalog variant + files directly (`source: "catalog"`, `catalog_variant_id`, placements[].layers[{type:"file",url}]), printful-types.ts L110-131. No sync products.

### A2. packages/fulfillment: provider catalog mapping
- `src/catalog-mapping.ts`: `ProviderCatalogMapping { skuId, provider, target: Record<string, unknown> }` (L9-13); repo get/save/remove/list(provider?) (L15-22); `requireCatalogTarget` (L44); in-memory repo (L50-71). Durable repos: adapter-postgres (`provider_catalog_mappings` table, src/provider-catalog-mappings.ts L5), adapter-sqlite, adapter-mongodb, adapter-convex.
- Printful target = `PrintfulCatalogTarget { catalogVariantId, retailPrice?, name?, placements?[{placement, technique, layers[{type:"file",url}]}] }` (adapter-printful src/mapping.ts L20-25). Written by applyPrintfulProduct (products.ts L124-131), read by `printfulCatalogTargetsFrom`, which only checks catalogVariantId is an integer (index.ts L223-228).
- `list("printful")` already gives "every SKU mapped to Printful", usable for a back-link view.

### A3. packages/print-art
- `layouts.ts`: `PrintLayout {id, inches, px}` (L5-10); `layoutsAtDpi(inchesById, dpi)` (L15, comment: Printful print files are 150 dpi); `printCoverage(garment, print, topInches=3)` (L40) -> width%/length%/fits.
- `files.ts`: naming `/{prefix}/{artId}-v{n}-{layout}.png` (L10-40); `createPrintFileHandler` (L61-78) serves a PNG rendered by the store's own `ArtRenderer` at layout px, immutable 1-year cache (L50). This is what can produce Printful placement file URLs (layer url = public print-file URL).
- `versions.ts`: immutable `ArtVersion<T>{version, copy, note}` (L11-17), `ArtVersionStore` list/get/save (L22-31); pins.ts `ArtPins`, `resolveArtVersion` (L34).
- Gap: layouts are hand-entered inches; nothing derives them from Printful's placement dimensions / mockup-styles (print_area_width/height, dpi).

### A4. packages/admin-ui
- package.json: deps `@mercatus-liber/print-art`; peer `react ^19`; tests vitest + jsdom.
- Exports (src/index.ts): PrintCoverage, ArtVersionEditor, RatingsTable(+summarizeScores), OptionMatrixConfigurator(+resolveMatrixSelection).
- Style: inline `style={{...}}` only (60 uses, 0 className), colours via theming CSS variables with fallbacks (`var(--color-primary)`, `--color-surface`, `--color-text`, `--color-danger, #b42318`, `--color-text-muted`) e.g. print-coverage.tsx L33-51. Data in, actions out as props; actions return `void | {ok:true} | {ok:false,error}` or throw (option-matrix-configurator.tsx L42, L52). Client components marked `"use client"` (option-matrix-configurator.tsx L1), `useTransition`.
- OptionMatrixConfigurator props (L44-59): options (values may depend on earlier choices), images(selection), aside(selection) (e.g. PrintCoverage), onAdd, onChange. ArtVersionEditorProps at art-version-editor.tsx L31.
- No Printful-specific component; no data fetching inside components.

### A5. packages/catalog
- service.ts: createProduct always `status: "draft"` (L166-182); updateProduct (L185); publishProduct -> "active" (L193); unpublishProduct -> "draft" (L201); getProductBySlug (L219); createSku (L227, optional images); updateSku (L245); listSkusByProduct (L257). Events `catalog.product.created/updated`.
- Product: identifyingAttributeKeys (free-form), images?: ProductImage[{url, alt}] with images[0] hero (core/src/schema.ts L58-62, L76-96). Sku: identifyingAttributes, price, status, images? (L123-143).

### A6. apps/reference-storefront
- Admin area: `app/demo/[demoSlug]/admin/**` (layout.tsx does session check, L33-49). Pages: catalog, products/[productId]/skus, orders, plugins (lists `plugins.list()`), bundles, promotions, cms, etc. No Printful page.
- Wiring: server components call `getServicesForDemo(demoSlug)`; mutations are `"use server"` form actions in `lib/actions.ts` taking FormData with a hidden `demoSlug` (`requireDemoSlug` L51) and `requireAdminPermission(demoSlug, "mutate")` (L91-97), then revalidatePath.
- lib/services.ts: imports createPrintfulFulfillmentAdapter etc. (L38); providerCatalogMappings postgres-or-memory (L1055); Printful adapter registered only when `PRINTFUL_API_TOKEN` set (L1149-1164) with `resolveCatalogTarget: printfulCatalogTargetsFrom(providerCatalogMappings)`. No catalog client is constructed; comment at L1031-1041 says there is no SKU->variant data source and no live token in this environment.
- The storefront does not import admin-ui or print-art (grep found none).

### A7. Sibling ../shop (shop.mdostal.com) Printful tooling (read only)
- lib/printful-catalog.ts (361 lines): hand-curated blanks (Gildan 64000, Bella 3001, ...) with catalog_variant_ids, placement/technique, found by hand via `GET /v2/catalog-products/{id}/prices` and `GET /mockup-generator/printfiles/12` (v1; L19: DTG front 1800x2400 @150 dpi, fill "fit").
- lib/size-charts.ts / garment-measurements.ts: from `GET /v2/catalog-products/{id}/sizes`, pasted in.
- scripts/apparel-mockups.mjs, aop-sample-mockups.mjs, lab-back-renders.mjs: `POST /v2/mockup-tasks` + polling, hand-picked mockup style ids per product (apparel-mockups.mjs L18), `GET /v2/catalog-products/{id}/mockup-styles?placements=` (lab-back-renders.mjs L40). Note L5: "Printful allows 2 mockup task creations a minute".
- scripts/build-print-files.py, build-desk-print-files.py, build-aop-pattern.py: print files sized to printfiles specs.
- components/admin/LabConfigurator.tsx already uses admin-ui's OptionMatrixConfigurator + PrintCoverage; BackPrintEditor; app/admin/back-prints.
- Takeaway: everything from "which blank" to "which mockup style" was done by hand with scripts and pasted constants.

## B. Printful API

### Auth (probed with curl, no token, 2026-11-20)
- ALL v2 catalog endpoints return 401 "This endpoint requires Oauth authentication!": `/v2/catalog-products`, `/{id}`, `/catalog-variants`, `/prices`, `/availability`, `/mockup-styles`, `/mockup-templates`, `/sizes`, `/v2/catalog-categories`. v2 OpenAPI (https://developers.printful.com/docs/v2-beta/openapi.json) marks every catalog op `security: OAuth []` (no scope, so any private token works; not verified with a token).
- v1 public catalog DOES work without auth: `GET https://api.printful.com/products` -> 200, 586 products (none discontinued; top types T-SHIRT 166, CUT-SEW 115, EMBROIDERY 75, SUBLIMATION 45, DTFILM 43). `GET /products/71` -> 200, product + 628 variants. Spec security None for /products, /products/{id}, /products/variant/{id}, /products/{id}/sizes (https://developers.printful.com/docs/openapi.json). Unauth rate limit header 30/60 s.
- v1 `/mockup-generator/printfiles/{id}` and `/templates/{id}` -> 401 (OAuth).
- Total v2 catalog count: not verified (needs a token). v1 public count is 586.

### Paging
- v2 list: `limit` 1-100 (limit=1000 -> 400 "Invalid limit value (required 1-100)"), default 20, `offset`; `paging{total,offset,limit}` + `_links` next/prev. Filters on `/v2/catalog-products`: category_ids, colors, placements, techniques, new, selling_region_name, destination_country, sort_type (new/rating/price/bestseller), sort_direction. So "load ALL" = about 6 pages of 100.
- v1 `/products` returns the whole list in one response (only `category_id` filter).

### Product shape
- v2 product: id, type, main_category_id, name, brand, model, image, variant_count, is_discontinued, description, sizes, colors, techniques[{key, display_name, is_default}], placements[{placement, technique, layers, placement_options, conflicting_placements}], product_options (v2-beta docs).
- v2 variant: placement_dimensions[{placement, width, height, orientation}] (units not stated in docs).
- `/v2/catalog-products/{id}/mockup-styles`: per placement+technique: print_area_width, print_area_height, print_area_type, dpi (e.g. 150), mockup_styles[{id, category_name, view_name, restricted_to_variants}].
- `/v2/catalog-products/{id}/mockup-templates`: template_width/height, print_area_width/height, print_area_top/left, image_url, background_url, background_color, placement, technique, catalog_variant_ids, orientation. This is the positional data for drawing art on a blank (v2 equivalent of v1 /mockup-generator/templates).
- v1 /products/71 (public): techniques DTG/EMBROIDERY/DTFILM; `files` = placements with `additional_price` (e.g. back 5.95, sleeve 2.49, label_inside 0.99); variants with size, color, color_code, image, price ("13.92"), availability_status per region (US, EU, EU_LV, CA, UK).
- Prices: `/v2/catalog-products/{id}/prices` (placement + variant technique prices; params selling_region_name, currency). Availability: `/v2/catalog-products/{id}/availability`, `/v2/catalog-variants/{id}/availability`.
- v1 printfiles schema: Printfile{printfile_id,width,height,dpi,fill_mode,can_rotate}; Template{template_width,template_height,print_area_width/height/top/left,is_template_on_front,orientation}.

### Mockups
- v2 `POST /v2/mockup-tasks` (OAuth): {format jpg|png, mockup_width_px (default 1000), products[{source:"catalog"|product template, catalog_product_id, catalog_variant_ids, mockup_style_ids, orientation, placements[{placement, technique, print_area_type, layers, placement_options}], product_options}]}. Async: poll `GET /v2/mockup-tasks?id=` or webhook `mockup_task_finished`.
- Limits (v2 docs): 2 task-creation requests/minute for new stores, 10/minute after $10 fulfilled orders; 20,000 generated files per day per environment.
- v1 equivalent: `POST /mockup-generator/create-task/{id}`, `GET /mockup-generator/task`, OAuth.

### Store / sync products vs catalog orders
- v1 Sync Products: `POST/GET /store/products`, `PUT/DELETE /store/products/{id}` (scope sync_products), max 100 sync variants, 10 req/min. v1 `/product-templates` read/delete only.
- v2 docs: "Product management, with sync products or product templates, is not available in version 2 of the API yet."
- This repo orders catalog variant + files directly (no Printful store products). Files: v2 `POST /v2/files` (by URL), `GET /v2/files/{id}`; list endpoint removed (410).

### Embedded Design Maker (EDM)
- https://developers.printful.com/docs/edm/ : iframe designer, script `https://files.cdn.printful.com/embed/embed.js` (`PFDesignMaker`). Backend gets a single-use nonce via `POST https://api.printful.com/embedded-designer/nonces` {external_product_id, ...} with a private token that has the "Embedded Designer" extension; domains must be registered in the developer portal. Saving yields a product template id via `onTemplateSaved`; ordering is by product template (v2 order item source enum includes `product_template`).
- Access: "you must first request access through our enterprise form" (https://www.printful.com/enterprise/embedded-design-maker). That page targets platforms, routes to contact sales, states no eligibility/pricing, and says "Printful Enterprise is operated and provided by Printify, Inc. and its affiliates." Pricing and licence terms: not verified (not published on the pages read). Treat as gated / possibly paid; per memory rule, ask before building toward it.
- The nonces endpoint is not in the published v1/v2 OpenAPI path lists.

### Rate limits
- v2: 120 req/60 s (`X-Ratelimit-Policy: 120;w=60;`, observed in headers); catalog section says 60 s lockout on exceed. v1: 120/min general, 30/min unauthenticated (observed `x-ratelimit-limit: 30`), mockups 2-10/min, sync products 10/min. 429 with Retry-After.

### Cost
- https://www.printful.com/pricing : "Printful is free to use - there are no monthly fees to create products or connect your store." Free plan includes "Free Design Maker and Mockup Generator". Optional Growth $24.99/month. API pricing not stated on that page (no evidence of a fee). You pay only for confirmed orders ("You are only charged for orders when they have been confirmed", v2 docs). EDM: gated via enterprise sales, pricing not published (flag).

## Options this enables
1. Browse-all catalog in admin: page `GET /v2/catalog-products` (limit 100, filters) with a token, or v1 `/products` with no token (586 items, one call).
2. Product detail: variants + colour swatches (color_code) + prices + availability + placements with print-area dimensions/DPI from mockup-styles/mockup-templates.
3. "Bring over": build a `PrintfulProductSpec` from the selection and reuse `planPrintfulProduct`/`applyPrintfulProduct` (already idempotent); add images + publish step.
4. Back-link: `ProviderCatalogMappingRepository.list("printful")` to mark which catalog items are already in the store.
5. Placement: mockup-templates positions + print-art `layoutsAtDpi` (derive layouts from print_area dims) + admin-ui PrintCoverage-style SVG overlay; print-art file handler for placement file URLs.
6. Preview: `createMockupTasks`/`getMockupTasks` (respect 2/min) to render real mockups and store them as product/SKU images.
7. EDM only after access request and terms review (gated).
