# @mercatus-liber/adapter-x3d

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` that has [X3D Studios](https://x3dstudios.com) print and ship orders. X3D is a 3D print farm in Austin, Texas, running its own Bambu Lab machines, with a self-serve order API. It is the adapter to use for **multicolour** prints: it takes an already-sliced multicolour file and prints it as sliced.

Built from X3D's published API documents (<https://x3dstudios.com/docs/api>, <https://x3dstudios.com/openapi.json>, read 2026-11-15) and tested against a fake of that API. **It has not placed an order with a live account.**

## What X3D does, as its documents state it

- **Materials:** PLA, PETG, ABS, ASA, TPU. Twelve stock colours at the material rate; any other colour is bought in and billed at $0.20/g.
- **Price:** $0.12/g for PLA and PETG, $0.15/g for ABS and ASA, $0.20/g for TPU. $1.00 minimum per part, each print line rounded up to the whole dollar. 5% off from 5 units, 10% off from 10. No order fee.
- **Multicolour:** send a `.gcode.3mf` sliced with the colours assigned. A plate using five or more filaments adds a $25 "second-AMS" fee, once per order. The documents do not say which printer profile to slice for, or whether a painted but unsliced 3MF prints in colour through the API. Ask X3D before relying on either.
- **Postage:** US standard $7, free from a $49.50 print subtotal; US express $15; 23 other countries at $30, free from $500.
- **Lead time:** API orders print at normal speed, 4 to 5 business days. Priority printing is not sold through the API.
- **Build volume:** 340 × 320 × 340 mm. Files up to 100 MB.
- **Payment:** the card on file is charged when the order is placed. There is no draft, no sandbox and no idempotency key. An order cannot be cancelled or edited through the API; email X3D with the order code.
- **Status:** no webhooks. Poll the order.

## How this adapter handles that

- **One X3D order per line.** X3D prints one model per order, so a store order with three printed lines becomes three X3D orders, each charged and posted separately. Each pays postage unless its own print subtotal reaches $49.50.
- **No double charges on retry.** The adapter checks the address and every line's mapping before it sends anything. It remembers each X3D order the moment X3D accepts it, and a line that already has a live X3D order is not placed again. A line whose order X3D cancelled or rejected is.
- **The one gap.** If the order request gets no answer at all (a dropped connection), X3D may or may not have created and charged the order, and it has no key-authenticated way to list orders. `submitOrder` throws `X3dSubmitError` with `outcomeUnknown: true`. Check the X3D account before submitting that order again.
- **Declined card.** X3D still creates the order, unpaid. The line is reported `held`; X3D prints nothing until it is paid from the X3D account. Do not resubmit.
- **Hold.** With `holdOrders`, nothing is sent and lines are reported `held`. Submit again with it off to release.
- **Customer email.** By default the customer's address is not sent to X3D, so X3D's own order emails go to the account owner only. Set `emailCustomer` to have X3D email the customer too.

## Use

```ts
import { createX3dFulfillmentAdapter, createX3dStatusPoller, x3dCatalogTargetsFrom, x3dOrderStoreFrom, X3D_PROVIDER } from "@mercatus-liber/adapter-x3d";

const x3d = createX3dFulfillmentAdapter({
  apiKey: process.env.X3D_API_KEY!,
  resolveCatalogTarget: x3dCatalogTargetsFrom(providerCatalogMappings),
  orderStore: x3dOrderStoreFrom(providerOrderLinks), // durable: this is what prevents double orders
});

const fulfillment = createFulfillmentService({ orders, routing, adapters: { manual, [X3D_PROVIDER]: x3d } });

// On a schedule (X3D suggests every 5 minutes; 15 once printing):
const poller = createX3dStatusPoller({
  getOrder: x3d.getX3dOrder,
  links: providerOrderLinks,
  record: (update) => statusRecorder.record(X3D_PROVIDER, update),
});
await poller.poll(); // publishes fulfillment.order.status_changed for what changed
```

### Mapping a SKU

Route the SKU to `x3d`, then save its target in the provider catalog mappings:

```ts
// A multicolour print: a file already sliced with its colours.
await providerCatalogMappings.save({ skuId, provider: "x3d", target: { fileUrl: "https://cdn.store.example/models/dragon.gcode.3mf", material: "pla" } });

// A single-colour print from a mesh.
await providerCatalogMappings.save({ skuId, provider: "x3d", target: { fileUrl: "https://cdn.store.example/models/bracket.stl", material: "petg", color: "Black", infill: 40 } });
```

| Target field | Notes |
|---|---|
| `fileUrl` | Where the store fetches the model at order time. The file name must end in `.stl`, `.glb`, `.gcode` or `.3mf`; set `fileName` when the URL does not. |
| `modelUrl` | Instead of `fileUrl`: the `gs://` URI of a model X3D already holds for the account. |
| `material` | `pla` (default), `petg`, `abs`, `asa`, `tpu`. |
| `color` | Stock spool name or hex, for single-colour prints. A sliced file's colours come from the slice. |
| `quality`, `infill`, `nozzleDiameter`, `layerHeight`, `note` | Passed through. `nozzleDiameter` must be 0.2, 0.4, 0.6 or 0.8; X3D silently prints anything else at 0.4, so the adapter refuses it. |

### Personalised prints: a file per order line

A product printed with the buyer's name or colour choices has a different file for every order line, and two lines of one order can share a SKU. `resolveCatalogTarget` and `loadModel` therefore get the line as well as the SKU:

```ts
createX3dFulfillmentAdapter({
  apiKey,
  orderStore: x3dOrderStoreFrom(providerOrderLinks),
  // line = { orderId, lineId?, lineIndex, quantity }
  resolveCatalogTarget: async (skuId, line) => {
    const job = await printJobs.find(line.orderId, line.lineId);
    if (!job?.slicedFileUrl) throw new Error(`No sliced file for order ${line.orderId}, line ${line.lineId} yet`);
    return { fileUrl: job.slicedFileUrl, material: "pla" };
  },
});
```

- Every line is resolved before anything is sent. If one line has no file yet, the resolver throws and nothing is ordered or charged for any line.
- `line.lineId` is set when the order's lines have ids: pass `lineId` on each item of the order your `OrderLookup` returns and `@mercatus-liber/fulfillment` carries it through. Without line ids, lines are told apart by SKU only, so two personalised lines of one SKU in one order cannot be handled; give lines ids if that can happen.
- Each line's X3D order is remembered under its line id, so a retry places only the line that is missing, and the status event names the line in `lineIds`.

### Products printed as several parts

X3D prints one model per order. A product that is more than one plate (a box and its lid) is therefore several X3D orders for one order line. Return the parts from `resolveCatalogTarget`:

```ts
resolveCatalogTarget: async (skuId, line) => [
  { partId: "base", fileUrl: baseUrl, material: "pla" },
  { partId: "lid", fileUrl: lidUrl, material: "pla" },
],
```

- Give each part a `partId` that is the same every time the line is resolved. Each part's X3D order is remembered under the line and that id.
- Every part of every line is resolved before anything is sent.
- The line stays one line. Its record lists every X3D order code, comma-separated, and reads:
  - `submitted` once every part is placed,
  - `shipped` once every part has shipped, with every tracking number joined by `, `,
  - `held` if a part is unpaid or was not sent,
  - `unfulfilled` if a part was cancelled, rejected or never placed. Submitting the order again then places only the missing part.
- The status poller publishes the line's change once: "shipped" goes out when the last part ships, not once per part.
- **Each part is charged and posted on its own.** A box and lid are two parcels and two lots of postage unless a part's own print cost reaches $49.50. X3D's documents describe no way to combine them; ask X3D.

`estimateX3dSlicedOrderCost({ grams, filaments, material?, quantity?, country?, shippingSpeed? })` works out what one sliced plate should cost from X3D's published rules (print, the $25 fee at five or more filaments, postage). It is an estimate for pricing, not a quote; add the parts up.

### Config

| Option | Required | |
|---|---|---|
| `apiKey` | yes | An `x3d_live_...` key from <https://x3dstudios.com/profile>. Needs a card on file. |
| `resolveCatalogTarget(skuId, line)` | yes | See `x3dCatalogTargetsFrom` for a per-SKU lookup, or the section above for a per-line one. |
| `orderStore` | no, but use one | Where placed orders are remembered. The default is in memory. |
| `loadModel(target, skuId, line)` | no | Returns the model as a `Blob` when a plain GET of `fileUrl` will not do. |
| `holdOrders` | no | Send nothing; report lines `held`. |
| `shippingSpeed` | no | `"express"` applies to US addresses only. |
| `emailCustomer`, `notifyEmails` | no | Who gets X3D's order emails (five addresses at most). |

## Pricing a part

`createX3dHttpClient(...).price({ bboxMm, material, quantity })` calls X3D's price endpoint. It prices **one colour** from a bounding box. X3D prices multicolour only from a real slice, so a multicolour part's cost is known from X3D's website calculator or from the first order's response (`placedOrderDetails(code)`).

## Not done

- No live order. The first real order is the test of the multipart field names and of how X3D treats a sliced multicolour file.
- No product-planning helpers like the Slant 3D and 3DAPI packages have.
- No cancel: X3D has no cancel endpoint.
