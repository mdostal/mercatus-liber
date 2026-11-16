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
| **X3D Studios** | Yes. Public OpenAPI spec, self-serve key. Added 2026-11-15. | Its own Bambu Lab machines in Austin, Texas | PLA, PETG, ABS, ASA, TPU. Multicolour from a sliced `.gcode.3mf`, up to 8 colours on its website calculator | $0.12 to $0.20 per gram in one colour, plus $0.03 per gram at two colours and $0.02 for each colour after. $1 minimum per part, no order fee. $25 once per order for five or more colours. US postage $7, free from $49.50. | 4 to 5 business days through the API |
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

### X3D Studios

- **Benefit.** The only provider found with both an order API a store can use and a documented multicolour path. One farm with its own machines, a person checks each part before packing, and prices are published per gram. A key is self-serve.
- **Cost.** One model per order, so each printed line of a store order is its own X3D order with its own postage. No draft, no sandbox, no idempotency key and no cancel endpoint: an order sent is an order charged. No webhooks, so status is polled. Multicolour needs a file already sliced with its colours; the documents do not say which printer profile to slice for. Ships from the US to 24 countries.
- **Build cost.** Small. One adapter package, built.

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

Use **X3D Studios** for multicolour prints (decided 2026-11-15). It costs more per order than a single-colour farm once the $25 fee for five or more colours applies, which the store covers in its price.

Ask **Printie** and **Shop3D** whether they will give API access. Printie has the wider material range.

Leave **Shapeways** until its API is confirmed working, and the application-only services until a store needs nylon, resin or metal.

## What is built

Three packages, usable by any Mercatus store. All were built from the providers' published API documents and tested against a fake of each API. **None has placed an order with a live account yet.** `@mercatus-liber/adapter-x3d` (provider key `x3d`) is described in its own README; the table below compares the other two.

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
| `SLANT3D_WEBHOOK_SECRET` | The platform's webhook secret. Turns on the webhook route for `slant3d`. |
| `DAPI_API_KEY` | Turns on 3DAPI. |
| `DAPI_HOLD_ORDERS=true` | Stops orders being sent. |
| `DAPI_USE_SAMPLE_CREDIT=true` | Spends the $15 sample credit first. |
| `DAPI_WEBHOOK_SECRET` | The webhook endpoint's secret. Turns on the webhook route for `3dapi`. |
| `X3D_API_KEY` | Turns on X3D Studios. Every order placed bills the card on that X3D account. |
| `X3D_HOLD_ORDERS=true` | Stops orders being sent. |
| `X3D_SYNC_SECRET` | Turns on `POST /api/demo/<demoSlug>/fulfillment/x3d/sync`, which a scheduler calls with `Authorization: Bearer <secret>` to read order status. X3D sends no webhooks. |
| `X3D_SHIPPING_SPEED=express` | US express postage ($15) instead of standard. |
| `X3D_EMAIL_CUSTOMER=true`, `X3D_NOTIFY_EMAILS` | Who gets X3D's own order emails. By default only the X3D account owner. |

A SKU goes to a provider only after it is routed there and mapped in the provider catalog mappings. Every other SKU stays on manual fulfilment.

### Not done

- No order has been placed with either provider. The first live draft at Slant is the check that matters: the adapter sends a `SKU` and `metadata` on each order, which Slant's documentation lists but its API specification does not.
- Slant cannot look an order up by the store's order id. The storefront stores the Slant order id when it places the order (`provider_order_links` on Postgres) and gives the adapter a `resolveExternalOrderId` that reads it back, so order status survives a restart on Postgres. On the other backends the link is still held in memory.
- Status webhooks: the reference storefront receives both providers at `POST /api/demo/<demoSlug>/fulfillment/<provider>/webhook` (`slant3d` or `3dapi`) once the provider's webhook secret is set. A verified event is published on the store's event bus as `fulfillment.provider_event` with `{ provider, event }`. When the event says something about an order the store placed, the store also publishes `fulfillment.order.status_changed` with its own order id, the new status, the tracking number and the carrier (see `docs/subsystems/22-fulfillment.md`). It publishes once per change, however often the provider retries. A Store API webhook subscription can receive that event. The storefront does not email the customer on it, and the admin still shows status by reading the order back. Tested with a locally signed Slant delivery, not a real one.
- The demo stores have no 3D-printed products mapped to either provider.
- 3DAPI webhook endpoints, billing details and cards can only be set up in its dashboard, not through the API.

### To go live with X3D Studios

1. Sign in at <https://x3dstudios.com/profile>, put a card on file, and generate a key.
2. Ask X3D (contact@x3dstudios.com) which printer profile a multicolour `.gcode.3mf` should be sliced for, and how it wants stock colours assigned in the slice.
3. Slice each multicolour model, host the file where the store can fetch it, and save a mapping `{ fileUrl, material }` for the SKU under provider `x3d`. Route the SKU to `x3d`.
4. Price each part on X3D's website calculator and set the retail price.
5. Set `X3D_API_KEY` and `X3D_HOLD_ORDERS=true`, place a test order, then unset the hold and submit it again to send one real order to yourself.
6. Set `X3D_SYNC_SECRET` and have a scheduler call the sync route every 5 to 15 minutes.

### To go live with Slant 3D

1. Create a key at <https://slant3dapi.com/> and connect a payment method.
2. Create a platform, then upload each model with `uploadFile`.
3. Price each file and plan the product with `planSlant3dProduct`.
4. Set `SLANT3D_API_KEY`, `SLANT3D_PLATFORM_ID` and `SLANT3D_HOLD_ORDERS=true`, place a test order, and check the draft at Slant before releasing it.

### To go live with 3DAPI

1. Sign up as an integrator and add business billing details. Orders are refused without them.
2. Quote files until 10 are approved. Review takes 24 to 48 hours.
3. Set `DAPI_API_KEY` and `DAPI_USE_SAMPLE_CREDIT=true` and place one order shipped to your own country.

## Printing in-house with SimplyPrint

A store that owns its printers does not need a provider to make the part. `@mercatus-liber/adapter-simplyprint` puts each paid order line into the print queue of the store's own farm, managed in [SimplyPrint](https://simplyprint.io), and tells the store when the print is done. The owner then packs it and buys the label through the store's own shipping flow. This is the in-house route to multicolour prints: the file in the queue is one the owner sliced, with its colours assigned, for his own machines.

Built from SimplyPrint's published API documents (read 2026-11-15) and tested against a fake of that API. **It has not been run against a live SimplyPrint account.** The package README lists what the documents left unknown.

What to know before choosing it:

- **Plan.** Adding to the queue with an API key needs SimplyPrint's Print Farm plan or higher. Pro can read the queue but not add to it. Webhooks also need Print Farm.
- **Bambu Lab printers.** SimplyPrint controls them through its Bambu Lab Client, a bridge program on a machine on the printers' network, with each printer in LAN-only Mode and Developer Mode. In Bambu's cloud mode SimplyPrint can watch a printer but not start prints on it.
- **It queues; it does not print or ship.** An item waits in the queue for a person or for SimplyPrint's AutoPrint. The line stays `submitted` from queued to printed. `shipped` comes from the store's own label flow (`recordSelfShipment`), never from this adapter.
- **"Printed" is a separate notice.** The line statuses have no word for "printed, ready to pack". Each finished print is published once on the store's event bus as `simplyprint.print.finished` with `{ noticeId, orderId, skuIds, queueItemId, printState }`.
- **A failed print is not re-queued.** It stays in SimplyPrint's queue and the line stays `submitted`. Deleting the queue item in SimplyPrint frees the line to be submitted again.

The reference storefront registers it when its credentials are set:

| Variable | Purpose |
|---|---|
| `SIMPLYPRINT_API_KEY`, `SIMPLYPRINT_COMPANY_ID` | Turns on SimplyPrint. Both are needed. The key is a user's API token; the company id is shown beside it in the panel. |
| `SIMPLYPRINT_HOLD_ORDERS=true` | Stops lines being queued. |
| `SIMPLYPRINT_SYNC_SECRET` | Turns on `POST /api/demo/<demoSlug>/fulfillment/simplyprint/sync`, which a scheduler calls with `Authorization: Bearer <secret>` to read the print queue. |
| `SIMPLYPRINT_WEBHOOK_SECRET` | Optional. The secret set on the webhook in SimplyPrint. Turns on the webhook route for `simplyprint`. |

### To go live with SimplyPrint

1. Be on the Print Farm plan. Connect the printers; for Bambu Lab machines install the SimplyPrint Bambu Lab Client and put the printers in LAN-only Mode with Developer Mode.
2. Make a SimplyPrint user for the store with access to the print queue, and generate its API token (account settings, API tab). Note the Company ID shown there.
3. Slice each model for the printers that will print it, colours assigned for a multicolour part, and upload the sliced file to the SimplyPrint file library. Find its id (the panel, or `GET files/GetFiles`).
4. Save a mapping `{ fileId }` for the SKU under provider `simplyprint`, with `queueGroupId` if the account has queue groups. Route the SKU to `simplyprint`.
5. Set `SIMPLYPRINT_API_KEY`, `SIMPLYPRINT_COMPANY_ID` and `SIMPLYPRINT_HOLD_ORDERS=true`, place a test order, then unset the hold and submit it again. Check the item in the SimplyPrint queue: the right file, the right amount, and a note naming the order and SKU. This is the first live test of the adapter; compare what SimplyPrint returned with the package README's list of unknowns.
6. Set `SIMPLYPRINT_SYNC_SECRET` and have a scheduler call the sync route every few minutes. Let the test item print and confirm one `simplyprint.print.finished` is published.
7. Optional: in SimplyPrint create a webhook (Regular format) to `/api/demo/<demoSlug>/fulfillment/simplyprint/webhook` for `job.done`, `job.failed`, `job.cancelled`, `queue.delete_item` and `queue.item_denied`, with a long random secret, and set the same value as `SIMPLYPRINT_WEBHOOK_SECRET`. SimplyPrint sends the secret itself in a header and does not sign the body, so use HTTPS.
8. Subscribe something to `simplyprint.print.finished` to tell whoever packs the orders. The storefront publishes the event and does nothing else with it.

## Sources

- Slant 3D: <https://www.slant3d.com/api>, API specification at <https://slant3dapi.com/v2/api/openapi.json>
- 3DAPI: <https://public-api.dapi.digital/docs>, its comparison with Printie at <https://www.dapi.digital/compare/3dapi-vs-printie> (written by 3DAPI)
- Printie: <https://printie.com/>
- Shop3D: <https://www.shop3d.io/integrations/>
- PrintPort3D comparison: <https://www.printport3d.com/blog/3d-print-dropshipping-companies> (written by PrintPort3D)
- Shapeways developer documents: <https://developers.shapeways.com/docs>, relaunch coverage at <https://3dprintingindustry.com/news/shapeways-relaunched-in-europe-as-manuevo-following-asset-acquisition-232193/>
- JLC3DP API programme: <https://jlc3dp.com/help/article/JLC3DP-API>
- Sculpteo API: <https://www.sculpteo.com/en/services/api-services/>
- SimplyPrint: <https://simplyprint.io/features/api>, <https://simplyprint.io/features/webhooks>, <https://simplyprint.io/features/api/bambu-lab-api>, API reference at <https://apidocs.simplyprint.io/> (read 2026-11-15)
