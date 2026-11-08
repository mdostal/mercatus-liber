# Mercatus Liber in flayr

How a Mercatus Liber store connects to [flayr](https://flayr.social) the way a Shopify store does today: flayr imports the catalog, builds posts, ads and campaigns from real products, and runs promotions for specials and holidays. Mercatus can do one thing Shopify can't in flayr today: create a real discount code for a campaign, instead of the shopper-facing offer being typed in by hand.

Written 2026-11-06 from a read of flayr's `development` branch and this repo's `master`. Paths into flayr are relative to `apps/dashboard/`.

## How Shopify works in flayr today

- **Connection.** One store per workspace, in `shopifyConnections` (`convex/schema.ts`). `installMethod` says who holds credentials: `managed`, `authorization_code`, or `zernio`. Slot and provider rules live in `convex/_lib/shopifyProvider.ts`.
- **Import.** `runImport` (`convex/shopifySyncActions.ts`) takes a lease and calls `src/app/api/shopify/import/run-import.ts`. That function already branches once, for Zernio (`readZernioRunContext` → `run-import-zernio.ts`). Both branches map products to `ShopifyProductInput` (`convex/lib/shopifySchema.ts`) and write through the same batch mutations in `convex/shopifySyncWrites.ts`. Rows are keyed on the workspace, so downstream code doesn't care who produced them.
- **Sync.** Shopify webhooks (`convex/shopifyWebhookHttp.ts`) re-read one product; a daily cron reconciles everything.
- **Content.** Products feed chat (`product-context.ts`), drafts and publish checks, the First Posts sample, BFCM sale banners (which infer a sale from `compareAtPrice`), and the campaign builder (`campaignBuilderSchema.ts`, product `source: "shopify"`).
- **Promotions.** None. Flayr asks only for `read_products`, and a campaign's offer code is typed in by the user.

The Zernio path is the precedent to copy: `.pHive/epics/shopify-connect-via-zernio/docs/design-discussion.md` §2 and §3.3.

## What Mercatus provides (this repo)

### 1. Store API: `@mercatus-liber/store-api`

A framework-free HTTP handler (`Request` in, `Response` out) that a store mounts at one path, for example `/api/store/v1`. Every request needs an API key in `Authorization: Bearer`. Keys are scoped and stored hashed, on any of the four databases.

| Method and path | Scope | Returns |
|---|---|---|
| `GET /store` | any | Name, currency, public URL |
| `GET /products?limit&cursor&status` | `products:read` | Products with variants, prices, images, categories, product page URL |
| `GET /products/:id` | `products:read` | One product, same shape |
| `GET /categories` | `products:read` | Category tree |
| `GET /promotions` | `promotions:read` | Promotions, with their schedule and targets |
| `POST /promotions` | `promotions:write` | Creates a discount, such as a holiday code. Starts inactive unless asked otherwise |
| `PATCH /promotions/:id` | `promotions:write` | Changes or ends one |
| `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id` | `webhooks:manage` | Subscribe a URL to store events |

Each variant carries `price` and, when an active product promotion applies to it, `salePrice` and the promotion id. That gives flayr's sale banners a real "was/now" without a compare-at field.

Product changes reach subscribers through the existing signed outbound webhooks (`@mercatus-liber/webhooks`): `catalog.product.created`, `catalog.product.updated`, `catalog.product.archived`, `catalog.sku.created`, and `promotions.redeemed`. Mercatus has no per-product timestamps, so a subscriber should also reconcile periodically, the same daily reconcile flayr already runs for Shopify.

### 2. Client: `@mercatus-liber/store-client`

A typed client for the API above plus `verifyMercatusWebhook(rawBody, signatureHeader, secret)`. Flayr imports this instead of hand-writing requests.

### 3. A store to test against

The reference storefront mounts the API at `/api/store/v1/<demo>` for its demo stores, with keys managed under Admin > Store API. Use `print-shop` to build and test the flayr side. It's sandbox data, so a mistaken write can't touch real orders. shop.mdostal.com adds the same mount when its team chooses to.

## What flayr needs to do

Ordered so each step ships on its own, all on feature branches off `development`.

1. **Provider marker.** Add `mercatus` to the commerce providers. The narrowest change mirrors Zernio: a new `installMethod: "mercatus"` on `shopifyConnections`, storing the store's API base URL and an encrypted API key, with the one-store-per-workspace rule unchanged. A rename to `commerceConnections` can come later and shouldn't block this.
2. **Connect.** A settings form that takes the store URL and API key, calls `GET /store` to prove the key, then writes the connection. Requested scopes: `products:read`, `promotions:read`, and, when the merchant allows it, `promotions:write` and `webhooks:manage`.
3. **Import.** A third branch in `run-import.ts`, beside the Zernio one: page through `GET /products` and map each product to `ShopifyProductInput` with a mapper like `zernio/map-product.ts`. Use ids of the form `gid://mercatus/Product/<id>`, which needs `GID_PATTERN` (`convex/_lib/shopifySelectionCore.ts`) and the import route's id checks widened to accept the `mercatus` namespace. Map `salePrice` to `compareAtPrice` the other way round: Shopify's compare-at is the old price, so set `price = salePrice` and `compareAtPrice = price`. Images: add the store's image host to the trusted hosts (`src/lib/shopify/trusted-image-host.ts`, `src/lib/safe-image-url.ts`, the CSP in `src/proxy.ts`). **Done and merged** (flayr PR [#3799](https://github.com/firefly-events/flayr/pull/3799)).
4. **Sync.** Register a webhook with `POST /webhooks` pointing at a new `/api/webhooks/mercatus` route, verify with the same HMAC contract `verifyMercatusWebhook` checks, and schedule the same single-product re-read. Add Mercatus rows to the daily reconcile. **Done and merged** (flayr PR [#3838](https://github.com/firefly-events/flayr/pull/3838)): the receiver landed as a real Next route (`src/app/api/webhooks/mercatus/[connectionId]/route.ts`), not a Convex httpAction like Shopify's/Clerk's own — verifying a delivery needs `decrypt()` to open the per-connection sealed secret, the same Next/Node-only boundary the Store API key already draws; Convex itself never opens either secret. 160 tests across the four commits (reconcile+adopt-sweep gate, single-product re-read, webhook registration at connect, the receiver itself).
5. **Content.** Accept `source: "mercatus"` wherever products are chosen: `selected-product.ts`, `campaignBuilderSchema.ts` (`arcProductValidator`), `ProductSelector.tsx`, `campaignArc.productKey`, and the draft provenance in `shopifyDrafts.ts`. Chat context, grounding, and claims read the imported rows, so they need no change beyond the image host. **Verified already done, by architecture — no code needed.** Read the real flayr code (not assumed): every one of those five files discriminates only on the literal `source === "shopify"` — the SAME literal Zernio products already carry, since neither Zernio nor Mercatus ever introduced its own `source` value — and treats `productGid` as an opaque string. `listProductsForActiveBrand` (`convex/shopifyCatalog.ts`) reads the `shopifyProducts` table by `clientProfileId` with no provider filter at all, and ML-03's import already writes Mercatus products into that exact table. A Mercatus-connected brand's `useProductSourceMode()` already resolves to `'shopify'` (`getConnectionForActiveBrand`'s `findConnectionByBrand` is a plain, provider-agnostic lookup). Net result: a Mercatus product already flows through the picker, the campaign builder, drafts and claims grounding today, unchanged.
6. **Promotions (new for flayr).** In the campaign builder, when the store is Mercatus and the merchant allowed `promotions:write`, offer "Create this code in the store": `POST /promotions` with the campaign's percent, code, and dates. Keep it as a draft until the merchant approves the campaign, then `PATCH` it active. Read `GET /promotions` so claims grounding can check a post's "20% off" against a real promotion instead of warning. **Scope correction, done and merged differently** (flayr PR [#3907](https://github.com/firefly-events/flayr/pull/3907)): "the campaign builder" named here doesn't exist live yet — `campaignBuilderSchema.ts`/`campaignArc.ts` (FFE-513) is schema and planning logic only, called from nowhere, with zero UI. Built the real backend capability (list/create/activate a promotion against the real store-api contract, drafts-only by construction) behind its own standalone card under Settings > Connections instead of bolting onto someone else's unfinished, unrelated feature. When FFE-513 ships a real UI, it can call this same backend.
7. **Specials and holidays.** The campaign planner (`planArc`) can schedule a promotion per beat: start and end dates come from the arc, and each beat's posts reference the code. This is where Mercatus earns its keep over Shopify in flayr. **Blocked on the same gap as step 6**: `planArc`/the campaign arc beats this step schedules promotions against don't exist as a live feature yet (FFE-513). Nothing to attach "one promotion per beat" to until that planner has a real caller. Revisit once FFE-513 ships its own UI, or if a beat/arc concept gets a reachable surface some other way.

Don't copy: Shopify App Store billing, the embedded app shell, install epochs, link tokens, and the GDPR compliance topics. Mercatus has no app store and no billing in the middle.

**Freeze to respect:** the cyber-week campaign builder has a change freeze on 2026-11-20, and the Shopify app is frozen during review. Land steps 1 to 4 before then only if they don't touch the frozen paths.

## Status (2026-11-06, flayr status added 2026-11-07)

Built in this repo: `@mercatus-liber/store-api`, `@mercatus-liber/store-client`, API keys on Postgres, SQLite, MongoDB, and Convex, and the reference storefront mount with an admin page. Checked against a local production build: a key created in the admin, then the client read the store and all 30 Print Shop products with categories and images, created a sale that stayed off until activated, saw the sale price once active, and was refused webhooks without that scope. Not yet checked: a webhook delivered to a real https receiver, and the deployed demo.

Known gap: checkout applies one automatic promotion per cart, while `salePrice` is per variant, so run one automatic sale at a time.

**flayr-side status (checked live against the real repo, not assumed; updated 2026-11-08):** steps 1–4 merged to `development` (PRs [#3788](https://github.com/firefly-events/flayr/pull/3788), [#3792](https://github.com/firefly-events/flayr/pull/3792), [#3799](https://github.com/firefly-events/flayr/pull/3799), [#3838](https://github.com/firefly-events/flayr/pull/3838)). #3799's Vercel preview build sat queued in Vercel's own build-concurrency queue for a long stretch on 2026-11-07/08 before a manual redeploy got it building — an infra constraint, not a code problem; it then needed one more `development` merge to clear a real (trivial, signature-only) conflict before it could merge. Step 5 needed no new flayr code (see above). Step 6 merged as [#3907](https://github.com/firefly-events/flayr/pull/3907) in a different shape than planned (standalone UI, not the campaign builder — see its row above). Step 7 (specials) is genuinely blocked on FFE-513, not started. 194 Mercatus-related tests green on `development` post-merge, verified in a clean worktree, not just on the feature branches.

## Open questions

1. Where is shop.mdostal.com's catalog read from by flayr: the shop's own deployment, or the demo? The demo is the safe test target; the shop is the real one.
2. Should flayr's Mercatus connection be behind its own feature flag, like `shopify_zernio`? Recommended yes.
3. Promotion writes: should flayr be allowed to activate a code, or only create drafts a person activates in the Mercatus admin? Recommended drafts only at first.
