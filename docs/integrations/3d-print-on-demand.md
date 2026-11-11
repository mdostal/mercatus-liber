# 3D print-on-demand providers

Which 3D print fulfilment services a Mercatus Liber store can send orders to, what each costs, and which ones have an adapter. Researched 2026-11-10 from each provider's own site and API documents. Comparison articles in this market are mostly written by the providers themselves, so anything taken from one is marked.

## What a store needs from a provider

A Mercatus store takes the order and the payment at its own checkout. The provider only has to make and ship the item. So the provider must let outside software do four things:

1. Price a model file, so the store knows its cost before setting a retail price.
2. Place an order for a stored file in a chosen material and colour, shipped to the customer.
3. Report status and tracking back, by webhook or by polling.
4. Do all of that without a Shopify, Etsy or WooCommerce store in the middle.

Point 4 rules out most of the market. Many services only connect through a marketplace app.

## The providers

| Provider | Order API a store can use | Where it prints | Materials | Fees stated | Lead time stated |
|---|---|---|---|---|---|
| **Slant 3D** | Yes. Public OpenAPI spec, self-serve key. | US print farms | PLA, PETG, OPM (a PCTG) | Print cost plus shipping per order. No per-order fee found. Prices come from the estimate endpoint, not a price list. | 95% of orders ship in 1 to 3 days |
| **3DAPI** | Yes. Public OpenAPI spec, webhooks, idempotent writes. | 30+ centres in 10+ regions, routed to the one nearest the buyer | FDM plastics | Production price plus shipping from a prepaid wallet. No monthly fee, no minimum. Platform fee of up to 10% applies only when 3DAPI hosts the checkout. | Not stated |
| **Shapeways** | Documented (`/orders/v1`), but not confirmed live. The company was relaunched after its 2024 bankruptcy and I found no 2026 source saying the API is back. | Eindhoven, Netherlands | Industrial: SLS nylon, resins, metals | Not checked | Not checked |
| **JLC3DP** | Yes, by application. Reviewed case by case. | China | FDM, resin, SLS, metal | Not public | Not stated |
| **Printie** | None found. Shopify, Etsy, Amazon, TikTok Shop, WooCommerce, eBay and Walmart apps only. | One US facility, ships to 75+ countries | 250+ materials and colours, multicolour from a painted 3MF, TPU, carbon-fibre blends | Print cost + flat order fee ($4.00 in their example) + shipping label | 3 business days |
| **Shop3D** | "Talk to us". No public documents. | Not stated (London company) | 200+, including precious metals, resin, SLS nylon | No monthly fee. Prices not published. | Not stated |
| **PrintPort3D** | None found. Connects through Shippo. | Orange, California | PLA | Price per part, assembly at $1 per part (their own article) | 3 to 7 business days (their own article) |
| **3D Vikings**, **WAZP+** | None found. Marketplace apps only. | WAZP+ ships from Ireland | Not stated | Not stated | Not stated |
| **Craftcloud** | Partner access only, by arrangement. | Marketplace of print services worldwide | Wide | A third-party listing says a 10% fee | Varies by service |
| **Sculpteo**, **i.materialise** | Yes, by contacting them. i.materialise needs invoice billing turned on. | France, Belgium | Industrial | Not public | Not stated |

## Costs and benefits

### Slant 3D

- **Benefit.** The shortest path to a real order. A key is self-serve. An order is created as a draft with its print and shipping cost, and only charged when it is processed, so a store can hold orders for review at no risk. Webhooks are signed. US production suits a US store.
- **Cost.** The API specification accepts STL only (the documentation page also names OBJ and 3MF). Parts are limited to 220 mm per side. Only three material families. Production is in the US, so orders abroad ship from the US. Prices are not published, so margin has to be worked out per file from the estimate endpoint, and shipping is only known once an order is drafted. A payment method has to be connected to the Slant account before an order can be drafted. Limits: 100 requests a minute, 5 platforms, 3 keys.
- **Build cost.** Small. One adapter package.

### 3DAPI

- **Benefit.** The best-documented API of the group: cursor paging, stable error codes, idempotency keys, signed webhooks with replay protection, an events log. Orders are made near the buyer, which cuts shipping time and duties outside the US. Ships worldwide except Russia, Belarus, Iran and Syria.
- **Cost.** An integrator account is only approved after 10 files pass review. There is no sandbox, so testing spends real money, offset by a $15 sample credit. Orders are paid from a prepaid wallet that tops up from a saved card. There is no draft state, so an order placed is an order charged. It is a newer company, and the claims about its network size come from its own site.
- **Build cost.** Small. One adapter package.

### Shapeways, JLC3DP, Sculpteo, i.materialise

- **Benefit.** Materials the two above cannot do: nylon, resin, metal.
- **Cost.** Each needs an application or a sales conversation before a key exists, and Shapeways' API is unconfirmed since the relaunch. Nothing can be built and tested until access is granted.
- **Build cost.** Small once access exists. Not worth building blind.

### Printie, Shop3D, PrintPort3D, 3D Vikings, WAZP+

- **Benefit.** Printie has the widest material and colour range and prints multicolour parts. Shop3D does precious metals.
- **Cost.** No way for a Mercatus store to send them an order in software. Using one means re-keying each order by hand, or asking the provider for API access.
- **Build cost.** Nothing to build until one of them offers an API. A store can still use any of them today through the manual fulfilment provider, which tracks the order while a person places it.

## Decision

Build adapters for **Slant 3D** and **3DAPI** now. Together they cover US orders with a hold-for-review step (Slant) and orders outside the US made locally (3DAPI), and both can be built and tested against public specifications.

Ask **Printie** and **Shop3D** whether they will give API access. Printie's multicolour printing is the one capability neither chosen provider has.

Leave **Shapeways** until its API is confirmed working, and the application-only services until a store needs nylon, resin or metal.

## What is built

Two packages, usable by any Mercatus store. Both were built from the providers' published API documents and tested against a fake of each API. **Neither has placed an order with a live account yet.**

| | `@mercatus-liber/adapter-slant3d` | `@mercatus-liber/adapter-3dapi` |
|---|---|---|
| Provider key | `slant3d` | `3dapi` |
| A SKU maps to | an uploaded file and a filament | a quote and its materials |
| Price a file | `createSlant3dCatalogClient().estimate` | `createDapiCatalogClient().quoteFile` |
| Plan a product with cost and margin | `planSlant3dProduct`, `applySlant3dProduct` | `planDapiProduct`, `applyDapiProduct` |
| Hold orders | Kept at Slant as an uncharged draft; release with `processHeldOrder` | Not sent at all, because 3DAPI has no draft; release by resubmitting |
| Retry safety | None from Slant: submitting the same order twice makes two drafts | Idempotency key and a lookup by order reference |
| Webhooks | Signed, 5 minute window | Signed, 5 minute window, repeat deliveries ignored |
| Tracking | Number only | Number only |

The reference storefront registers each one when its credentials are set:

| Variable | Purpose |
|---|---|
| `SLANT3D_API_KEY`, `SLANT3D_PLATFORM_ID` | Turns on Slant 3D. Both are needed. |
| `SLANT3D_HOLD_ORDERS=true` | Leaves orders as drafts. |
| `SLANT3D_WEBHOOK_SECRET` | The platform's webhook secret. |
| `DAPI_API_KEY` | Turns on 3DAPI. |
| `DAPI_HOLD_ORDERS=true` | Stops orders being sent. |
| `DAPI_USE_SAMPLE_CREDIT=true` | Spends the $15 sample credit first. |
| `DAPI_WEBHOOK_SECRET` | The webhook endpoint's secret. |

A SKU goes to a provider only after it is routed there and mapped in the provider catalog mappings. Every other SKU stays on manual fulfilment.

### Not done

- No order has been placed with either provider. The first live draft at Slant is the check that matters: the adapter sends a `SKU` and `metadata` on each order, which Slant's documentation lists but its API specification does not.
- Slant cannot look an order up by the store's order id. The adapter takes a `resolveExternalOrderId` callback for that; the storefront does not supply one yet, so it remembers Slant order ids only until it restarts.
- The storefront has no webhook route for either provider yet, so status comes from reading the order back, not from pushes.
- The demo stores have no 3D-printed products mapped to either provider.
- 3DAPI webhook endpoints, billing details and cards can only be set up in its dashboard, not through the API.

### To go live with Slant 3D

1. Create a key at <https://slant3dapi.com/> and connect a payment method.
2. Create a platform, then upload each model with `uploadFile`.
3. Price each file and plan the product with `planSlant3dProduct`.
4. Set `SLANT3D_API_KEY`, `SLANT3D_PLATFORM_ID` and `SLANT3D_HOLD_ORDERS=true`, place a test order, and check the draft at Slant before releasing it.

### To go live with 3DAPI

1. Sign up as an integrator and add business billing details. Orders are refused without them.
2. Quote files until 10 are approved. Review takes 24 to 48 hours.
3. Set `DAPI_API_KEY` and `DAPI_USE_SAMPLE_CREDIT=true` and place one order shipped to your own country.

## Sources

- Slant 3D: <https://www.slant3d.com/api>, API specification at <https://slant3dapi.com/v2/api/openapi.json>
- 3DAPI: <https://public-api.dapi.digital/docs>, its comparison with Printie at <https://www.dapi.digital/compare/3dapi-vs-printie> (written by 3DAPI)
- Printie: <https://printie.com/>
- Shop3D: <https://www.shop3d.io/integrations/>
- PrintPort3D comparison: <https://www.printport3d.com/blog/3d-print-dropshipping-companies> (written by PrintPort3D)
- Shapeways developer documents: <https://developers.shapeways.com/docs>, relaunch coverage at <https://3dprintingindustry.com/news/shapeways-relaunched-in-europe-as-manuevo-following-asset-acquisition-232193/>
- JLC3DP API programme: <https://jlc3dp.com/help/article/JLC3DP-API>
- Sculpteo API: <https://www.sculpteo.com/en/services/api-services/>
