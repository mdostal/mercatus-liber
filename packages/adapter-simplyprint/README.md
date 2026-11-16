# @mercatus-liber/adapter-simplyprint

A `FulfillmentAdapter` for `@mercatus-liber/fulfillment` for a store that prints its own orders. It puts each paid order line into the print queue of the store's own printers, managed in [SimplyPrint](https://simplyprint.io), and tells the store when the print is done. It is the adapter to use for **multicolour prints made in-house**, for example on a Bambu Lab farm with AMS units.

**It ships nothing.** The owner packs the part and buys the label through the store's own shipping flow (`@mercatus-liber/shipping`), which is what marks the line shipped.

Built from SimplyPrint's published documents (read 2026-11-15, listed under [Sources](#sources)) and tested against a fake of that API. **It has not been run against a live SimplyPrint account.** No queue item has been added, no status read and no webhook received for real.

## What SimplyPrint does, as its documents state it

- **API:** JSON over HTTPS at `https://api.simplyprint.io/{companyId}/{endpoint}`. The number is the account id, not a version. Auth is one header, `X-API-KEY`, with a token that belongs to one user and acts with that user's permissions. Every response has a `status` boolean and a `message`.
- **Plans:** API keys start on the Pro plan. With an API key, the queue-changing endpoints (add, update, delete) need **Print Farm** or higher; on Pro they refuse API-key calls. Reading the queue needs Pro. Webhooks need Print Farm, School or Enterprise.
- **Rate limit:** per user per minute: 60 on Pro, 180 on Print Farm and School, 600 on Enterprise. Over the limit the API answers HTTP 429 for a minute.
- **Adding to the queue:** `POST queue/AddItem` with `filesystem` (the id of a file in the account's file library), `amount`, and optionally `group`, `tags` and `custom_fields`. It returns the new queue item's id. There is no idempotency key.
- **Reading the queue:** `GET queue/GetPaginatedItems?v=2`, in slices `active`, `done` and `pending`. A queue item has no single state field. It has `is_done`, `paused`, `ongoing` (copies printing now), `failed` (failed prints), `left`, `printed`, and an `approval` object when the account uses queue approval. Finished items are removed after a while (`expires`).
- **Removing:** `GET queue/DeleteItem?job={id}`.
- **Webhooks:** a POST with `webhook_id`, `event`, `timestamp` and `data`. They are **not signed**. If a secret is set on the webhook, SimplyPrint sends that same secret in the `X-SP-Secret` header of every delivery. Failed deliveries are retried for 24 hours.
- **Bambu Lab printers:** full control needs the **SimplyPrint Bambu Lab Client**, a bridge program running on a machine on the same network as the printers, with each printer in **LAN-only Mode** with **Developer Mode** on. With a printer in Bambu's cloud mode SimplyPrint can watch it but cannot start prints: SimplyPrint says Bambu's Authorization Control System blocks third-party write actions over Bambu's cloud. SimplyPrint describes itself as independent of Bambu Lab. Whether a queued item starts by itself also depends on SimplyPrint's own AutoPrint and on the right filament being loaded; this adapter does not start prints, it only queues them.

## How this adapter handles that

- **One queue item per line.** The line's quantity is the item's `amount`, so three of one SKU is one item that prints three times.
- **Library files, not uploads.** Each SKU maps to the id of a file already in the SimplyPrint file library, sliced for the printers that will print it. For a multicolour part that is a file sliced with its colours assigned. Nothing is uploaded per order.
- **Which order is this?** After the item is added, the adapter sets its note to `Order <id> | SKU <sku> | qty <n>`. `queue/AddItem` has no note field, so this is a second request (`queue/UpdateItem`); if it fails the item still prints and the failure goes to `onNoteError`. Set `orderIdCustomFieldId` and `skuCustomFieldId` to also send them as custom fields in the first request.
- **No double queueing on retry.** Every line's mapping is resolved before anything is sent. Each queue item is remembered the moment SimplyPrint accepts it, and a line with a live item is not queued again. A line whose item was cancelled or denied is.
- **The one gap.** If the add request gets no usable answer (a dropped connection, a 5xx, or a success with no id in it), SimplyPrint may or may not have queued the item. `submitOrder` throws `SimplyPrintSubmitError` with `outcomeUnknown: true`. Look at the queue in SimplyPrint before submitting that order again.
- **Hold.** With `holdOrders`, nothing is sent and lines are reported `held`. Submit again with it off to release.
- **Printed is not shipped.** Queued, printing and printed are all line status `submitted`. Only a denied or deleted item is `unfulfilled`. Nothing here ever reports `shipped` or `delivered`.
- **A failed print stays `submitted`.** A failed print leaves its item in the queue with copies still to print, so queueing the line again would print it twice. The poller lists it under `attention`. To give up on an item, delete it in SimplyPrint or call `cancelQueueItem`; the line then reads `unfulfilled` and can be queued again.
- **"Printed, ready to pack" is its own notice.** The line statuses have no word for it, so the poller reports each finished print once, as a `SimplyPrintPrintNotice` (`{ noticeId, orderId, skuIds, queueItemId, printState: "printed" }`), through `onPrintFinished` and in the poll result's `finished`.
- **Webhooks fail closed.** `handleWebhookEvent` refuses every delivery unless `webhookSecret` is set and the `X-SP-Secret` header equals it.

### Print states

`simplyPrintPrintStateOf` derives one of these from the queue item's fields. It is the only function that reads them.

| Print state | From | Line status |
|---|---|---|
| `pending_approval` | `approval.status` is `pending` or `revision`, or the item is in the pending slice | `submitted` |
| `queued` | none of the others | `submitted` |
| `paused` | `paused` | `submitted` |
| `printing` | `ongoing` above 0 | `submitted` |
| `failed` | `failed` above 0 and nothing printing | `submitted` |
| `printed` | `is_done`, or listed in the done slice | `submitted`, plus the print notice |
| `denied` | `approval.status` is `denied`, or a `queue.item_denied` webhook | `unfulfilled` |
| `cancelled` | a `queue.delete_item` webhook, or `cancelQueueItem` | `unfulfilled` |
| `missing` | SimplyPrint no longer lists the item | `submitted`, or `unfulfilled` with `missingMeansCancelled` |

## Use

```ts
import { createSimplyPrintFulfillmentAdapter, simplyPrintCatalogTargetsFrom, simplyPrintOrderStoreFrom, simplyPrintPrintLogFrom, SIMPLYPRINT_PROVIDER } from "@mercatus-liber/adapter-simplyprint";

const simplyPrint = createSimplyPrintFulfillmentAdapter({
  apiKey: process.env.SIMPLYPRINT_API_KEY!,
  companyId: process.env.SIMPLYPRINT_COMPANY_ID!,
  resolveCatalogTarget: simplyPrintCatalogTargetsFrom(providerCatalogMappings),
  orderStore: simplyPrintOrderStoreFrom(providerOrderLinks), // durable: this is what prevents double queueing
  printLog: simplyPrintPrintLogFrom(providerOrderLinks), // durable: each finished print is reported once
});

const fulfillment = createFulfillmentService({ orders, routing, adapters: { manual, [SIMPLYPRINT_PROVIDER]: simplyPrint } });

// On a schedule, every few minutes:
const poller = simplyPrint.createStatusPoller({
  links: providerOrderLinks,
  record: (update) => statusRecorder.record(SIMPLYPRINT_PROVIDER, update),
  onPrintFinished: (notice) => tellTheOwner(`Order ${notice.orderId}: ${notice.skuIds.join(", ")} is printed`),
});
const { finished, attention } = await poller.poll();
```

One poll reads the whole queue in at least three requests (one per slice), however many items are open, and makes none when nothing is open. Do not wrap the adapter in `withProviderOrderLinks`: it stores each queue item itself.

### Mapping a SKU

Route the SKU to `simplyprint`, then save its target in the provider catalog mappings:

```ts
await providerCatalogMappings.save({ skuId, provider: "simplyprint", target: { fileId: "1a077dd6296417fe75555bf806b68089", queueGroupId: 213 } });
```

| Target field | Notes |
|---|---|
| `fileId` | Required. The id of a file in the SimplyPrint file library (sent as `filesystem`). `GET files/GetFiles` lists them. |
| `queueGroupId` | The queue group to add to. SimplyPrint requires a group when the account has queue groups. |
| `customTagIds` | Ids of custom tags made in SimplyPrint, put on the queue item. |

### Config

| Option | Required | |
|---|---|---|
| `apiKey` | yes | A user's API token from the panel's account settings, API tab. Print Farm plan or higher. |
| `companyId` | yes | "Company ID" on the same tab. |
| `resolveCatalogTarget(skuId)` | yes | See `simplyPrintCatalogTargetsFrom`. |
| `orderStore` | no, but use one | Where queue items are remembered. The default is in memory. |
| `printLog` | no, but use one | Which items were already reported printed. The default is in memory. |
| `holdOrders` | no | Send nothing; report lines `held`. |
| `queueGroupId` | no | The queue group for SKUs whose target names none. |
| `orderIdCustomFieldId`, `skuCustomFieldId` | no | Ids of text custom fields made in SimplyPrint for print queue items. |
| `missingMeansCancelled` | no | Treat an item SimplyPrint no longer lists as cancelled. Off by default; see below. |
| `onNoteError(error, item)` | no | Told when the note could not be written. |
| `webhookSecret`, `onWebhookEvent(action, event)` | no | See Webhooks. |

### Webhooks

Polling alone is enough. A webhook makes it quicker, and is the only way the adapter learns for certain that an item was deleted in the panel.

In SimplyPrint (Settings, Webhooks) create a webhook on the Regular tab for `job.done`, `job.failed`, `job.cancelled`, `queue.delete_item` and `queue.item_denied`, and give it a long random secret. Pass the same value as `webhookSecret`, and call `handleWebhookEvent(rawBody, request.headers.get("X-SP-Secret") ?? "")`. `onWebhookEvent` then receives one of:

- `{ kind: "queue_item_closed", queueItemId, printState }`: hand `simplyPrintStatusUpdateFromWebhookAction(action)` to the status recorder.
- `{ kind: "resync" }`: a job event. SimplyPrint's documented job payloads do not say which queue item the job came from, so run the poller now.
- `{ kind: "ignored" }`.

The secret is a shared password, not a signature: it is the same on every delivery and is not tied to the body, so a captured delivery could be replayed. Serve the endpoint over HTTPS only. `parseSimplyPrintWebhookEvent` and `simplyPrintWebhookActionFrom` do no authentication; do not put them behind a route by themselves.

## What the documents left unknown

Each of these is isolated in one function or one option, so a correction after the first live run is a small change.

- **The id field in the add response.** The API reference says `created_id`; the example on simplyprint.io/features/api shows `id`. `queueItemIdFromAddItemResponse` accepts either, reference first.
- **How a queue item's fields combine into a state.** The fields are documented; the order `simplyPrintPrintStateOf` checks them in is this package's. In particular, whether `failed` goes back to 0 when a retry starts is not stated.
- **What happens to a queue item when its print fails or is cancelled at the printer.** Not stated. The adapter assumes the item stays in the queue, which is the safe reading: it never queues again on a failure.
- **A missing item.** A done item is removed after `expires`, and nothing documents how to tell that from a deleted one once it is gone. A missing item therefore stays `submitted` and is listed under `attention`, unless `missingMeansCancelled` is set. The print log stops a printed item from ever being read as missing.
- **Which slice holds what.** The adapter reads `active`, `pending` and `done` and merges them. Whether items waiting for approval also appear in `active`, and what `all` contains, is not stated. A denied item is left out of listings by default and so reads as `missing` unless the `queue.item_denied` webhook arrives.
- **The shape of `tags` on `queue/AddItem`.** The reference says to send the custom tag body of `tags/Assign` "without `type`, `id` or `edited`", which leaves `{ tag_id, custom }`. That is what is sent when `customTagIds` is set.
- **HTTP method.** The endpoint index lists every endpoint as POST; the detailed pages show GET for `queue/DeleteItem` and `queue/GetPaginatedItems`. The detailed pages are followed.
- **Error bodies.** `status: false` with a `message` is documented. The message for a missing file, a missing queue group or a plan that lacks the queue is not, so the adapter reports the message and does not interpret it.
- **Whether `queue.delete_item` also fires for a done item cleared from the done list.** The description says "removed before printing". A delete event for an item already logged as printed is ignored either way.

## Not done

- No live run. The first real queue item is the test of the request fields and of the state reading.
- No personalised prints. The file is looked up per SKU, so two lines of one SKU are one queue target, and a product with a different file per order line (a buyer's name on it) cannot be queued through this adapter yet. `@mercatus-liber/adapter-x3d` resolves per line; doing the same here also needs the upload API below, because each personalised file would have to be put in the library first.
- No file upload. SimplyPrint has an upload API on a separate host (`files.simplyprint.io`); this adapter only queues library files.
- No choice of printer. SimplyPrint matches a queue item to a printer itself; the `for_printers`, `for_models` and `for_groups` fields are not sent.
- Nothing starts a print. Queue items wait for a person or for SimplyPrint's AutoPrint.
- `cancelQueueItem` publishes no event; the store that called it already knows.

## Sources

Downloaded and read as files on 2026-11-15:

- <https://simplyprint.io/features/api.md> and <https://simplyprint.io/features/api/bambu-lab-api.md>
- <https://simplyprint.io/features/webhooks.md>
- <https://help.simplyprint.io/en/article/the-simplyprint-api-a-quick-intro-for-developers-17fpo7l/>
- <https://help.simplyprint.io/en/article/all-about-the-webhooks-feature-1g12e5c/>
- <https://apidocs.simplyprint.io/> and <https://apidocs.simplyprint.io/llms.txt>
- Under <https://apidocs.simplyprint.io/static/>: `queue-AddItem.txt`, `queue-UpdateItem.txt`, `queue-DeleteItem.txt`, `queue-GetItem.txt`, `queue-GetPaginatedItems.txt`, `tags-Assign.txt`, `custom_fields-SubmitValues.txt`, `webhooks-Create.txt`, `jobs-GetPaginatedPrintJobs.txt`, `files-GetFiles.txt`
