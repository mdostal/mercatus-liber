/**
 * Printful v2 API shapes this adapter actually calls, confirmed 2026-09-09 against
 * Printful's real, current v2-beta API surface -- NOT the addendum's directional
 * summary, and NOT training-data recall. Confirmed by cross-referencing:
 *   - developers.printful.com/docs/v2-beta/ (fetched directly; the live page is a
 *     JS-rendered API reference that truncates under automated fetch, so it alone
 *     was NOT sufficient -- see below),
 *   - the TypeScript client generated straight from Printful's own published
 *     OpenAPI spec via `openapi-typescript-codegen`
 *     (github.com/spencerlepine/printful-sdk-js-v2, `src/models/*.ts` and
 *     `src/services/OrdersV2Service.ts` / `WebhookV2Service.ts` -- these files carry
 *     the literal field names, optionality, and endpoint paths straight from
 *     Printful's own spec, not a third party's guess),
 *   - developers.printful.com/docs/v2-preview/ (fetched directly; enumerates the
 *     real v2 webhook event-type strings used below).
 *
 * Research finding 1 -- external-id field (see design-discussion.md §1a): CONFIRMED
 * current and unchanged. Printful's v2 order-creation request body has a real,
 * documented `external_id` field at the ORDER level (`CreateOrderRequest.external_id`
 * below, optional string) -- this is exactly the field historically named
 * `external_id` on v1's `POST /orders`, still present and unrenamed in v2. Every
 * v2 order item can ALSO carry its own `external_id` (`OrderItemInput.external_id`
 * below) -- this adapter uses the order-level field for `orderId` and the
 * item-level field for `skuId`, so no adapter-shopify-style reserved-metafield
 * fallback is needed (that fallback is documented in mapping.ts anyway, unused,
 * for the record). Both a v2 order and a v2 order item can be looked up later by
 * that external id, prefixed with "@" in the path
 * (`GET /v2/orders/@{external_id}`) -- confirmed directly in
 * `OrdersV2Service.getOrder`'s doc comment in the generated client.
 *
 * Research finding 2 -- v2 POST /v2/orders field-level schema (design-discussion.md
 * §1b): CONFIRMED via `OrdersV2Service.createOrder`'s generated request-body type
 * and `examples/typescript/createOrder.ts` in the same repo (a worked, documented
 * example straight from Printful's own docs). Top-level body:
 * `{ external_id?, shipping?, recipient: Address, order_items: (CatalogItem |
 * ProductTemplateItem)[], customization?, retail_costs? }`. A catalog-sourced line
 * item (`source: "catalog"`) references a design/mockup via `catalog_variant_id`
 * (Printful's own numeric variant id) plus a `placements` array
 * (`{ placement, technique, layers: [{ type: "file", url }] }`), NOT a
 * previously-created mockup-task id -- the mockup API (`POST /v2/mockup-tasks`,
 * addendum's own finding, out of this story's scope) is for generating a preview
 * image, not for referencing a design at order time. Confirming the endpoint path
 * for confirmation: it is `POST /v2/orders/{order_id}/confirmation` (note:
 * "/confirmation", not "/confirm" as the addendum's own directional summary
 * abbreviated it -- confirmed directly in `OrdersV2Service.confirmOrder`).
 *
 * Research finding 3 -- v2 webhook signature format (design-discussion.md §1c):
 * the September 2026 research pass called this genuinely UNCONFIRMABLE from
 * public docs -- **re-checked live 2026-10-15 (story dp-02, epic 82, per that
 * story's own explicit "don't trust the stale note, re-verify" instruction) and
 * found to now be documented.** The September pass's automated fetch of
 * developers.printful.com/docs/v2-preview/'s JS-rendered reference truncated
 * before reaching the real "Webhook v2" -> "Event signing" section -- the scheme
 * was apparently already real and public, just missed, not something Printful
 * newly published in the intervening five weeks (no changelog entry found
 * confirming either way, so this is disclosed as "missed," not asserted as
 * "newly added"). The real, confirmed mechanism (quoted close to verbatim from
 * developers.printful.com/docs/v2-beta/'s own "Webhook v2" tag):
 *   - the incoming webhook POST carries the signature as "the hexadecimal
 *     representation of the signature" in a real `x-pf-webhook-signature`
 *     header, alongside an `x-pf-webhook-public-key` header (base64, identifies
 *     which webhook configuration signed it);
 *   - "We're using HMAC-SHA256 hash to create the signature";
 *   - the webhook configuration's own `secret_key` -- returned ONCE, in the
 *     `POST /v2/webhooks` (Set up webhook configuration) response at setup time;
 *     confirmed directly that `GET /v2/webhooks` echoes back `public_key` but
 *     NOT `secret_key` again -- is itself hex-encoded, and "you need to decode
 *     it before passing it to the tool or method that calculates the signature"
 *     (i.e. the real HMAC key is the DECODED raw bytes, not the hex string).
 * One genuine residual gap, disclosed rather than guessed at: the docs never
 * explicitly spell out which exact bytes are signed (raw body vs. some
 * canonicalized form) -- see `verifyPrintfulSignature`'s own doc comment
 * (webhook.ts) for how this implementation resolves that ambiguity and why.
 * `handleWebhookEvent` below verifies by default once a caller supplies
 * `webhookSecretKeyHex` (mirroring adapter-printify's own `webhookSecret`
 * config field), still fails closed with
 * `PrintfulWebhookSignatureUnconfirmedError` when neither that nor a custom
 * `verifyWebhookSignature` is configured, and still never guesses at a
 * caller-unconfigured scheme -- see index.ts's doc comment on that error.
 *
 * The real, documented v2 webhook event-type strings (confirmed via the same
 * v2-preview fetch) this adapter parses: `order_created`, `order_updated`,
 * `shipment_sent`, `shipment_delivered` (the four this story's description names),
 * plus others (`order_failed`, `order_canceled`, `shipment_returned`,
 * `catalog_stock_updated`, `mockup_task_finished`, etc.) that exist in the real API
 * but are out of this story's scope -- `parsePrintfulWebhookPayload` in webhook.ts
 * passes any other real type string through as `"other"` rather than throwing, so
 * a real webhook subscription is never broken by an event type this adapter
 * doesn't specifically act on yet.
 */

/** Printful v2 `Address` -- the real recipient shape (createOrder.ts / Address.ts). Every field is genuinely optional in the schema; Printful itself rejects a request with too little address data, this adapter does not re-validate. */
export interface PrintfulAddress {
  name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_code?: string;
  state_name?: string;
  country_code?: string;
  country_name?: string;
  zip?: string;
  phone?: string;
  email?: string;
  tax_number?: string;
}

/** One layer of a placement -- the real, current shape (`{ type: "file", url }`) confirmed in `examples/typescript/createOrder.ts`. */
export interface PrintfulPlacementLayer {
  type: "file";
  url: string;
}

/** One print placement on a catalog item -- confirmed shape. */
export interface PrintfulPlacement {
  placement: string;
  technique: string;
  layers: PrintfulPlacementLayer[];
}

/** A catalog-sourced order item request body -- confirmed shape (`CatalogItem` model = `Item & { source: "catalog", catalog_variant_id }`). */
export interface PrintfulCatalogOrderItemInput {
  source: "catalog";
  catalog_variant_id: number;
  quantity: number;
  external_id?: string;
  retail_price?: string;
  name?: string;
  placements?: PrintfulPlacement[];
}

/** `POST /v2/orders` request body -- confirmed shape (`OrdersV2Service.createOrder`'s generated request-body type). */
export interface PrintfulCreateOrderRequest {
  external_id?: string;
  shipping?: string;
  recipient: PrintfulAddress;
  order_items: PrintfulCatalogOrderItemInput[];
}

/** One order item as Printful echoes it back on an order response -- confirmed fields (`examples/typescript/createOrder.ts`'s documented example response). */
export interface PrintfulOrderItemResponse {
  id: number;
  type: string;
  source: string;
  catalog_variant_id: number;
  external_id: string | null;
  quantity: number;
  name?: string;
  price?: string;
  retail_price?: string;
  currency?: string;
}

/**
 * The real, documented v2 order status values (confirmed via `Order.ts`'s own
 * doc comment on the `status` field): draft / failed / pending / canceled /
 * onhold / inprocess / partial / fulfilled. There is no separate "delivered"
 * order status -- delivery is a per-shipment fact (`Shipment.delivery_status`
 * below), not an order-level one.
 */
export type PrintfulOrderStatus = "draft" | "failed" | "pending" | "canceled" | "onhold" | "inprocess" | "partial" | "fulfilled";

/** `GET /v2/orders/{order_id}` response's `data` -- only the fields this adapter reads. */
export interface PrintfulOrderResponse {
  id: number;
  external_id: string | null;
  status: PrintfulOrderStatus;
  recipient: PrintfulAddress;
  order_items: PrintfulOrderItemResponse[];
}

/** The real, documented v2 shipment shape (`Shipment.ts`). Note there is genuinely no `tracking_number` field in this schema -- only `tracking_url` and a `tracking_events` timeline -- documented here rather than invented. */
export interface PrintfulShipmentResponse {
  id: number;
  order_id: number;
  shipment_status: "pending" | "onhold" | "canceled" | "packaged" | "shipped" | "returned" | "outstock";
  delivery_status: "unknown" | "delivered" | "pre_transit" | "in_transit" | "out_for_delivery" | "available_for_pickup" | "return_to_sender" | "failure" | "canceled";
  tracking_url?: string;
  shipment_items?: { order_item_id?: number; quantity?: number }[];
}

/** A thin `{ data: T }` envelope -- every v2 response wraps its payload this way (confirmed in the documented example response in `examples/typescript/createOrder.ts`). */
export interface PrintfulEnvelope<T> {
  data: T;
}

/**
 * The real, documented v2 webhook event-type strings this adapter's
 * `handleWebhookEvent` recognizes by name (confirmed via
 * developers.printful.com/docs/v2-preview/). Real event types beyond these four
 * exist (see printful-types.ts's top doc comment) and are intentionally passed
 * through as `"other"` rather than rejected.
 */
export type PrintfulWebhookEventType = "order_created" | "order_updated" | "shipment_sent" | "shipment_delivered";

export const PRINTFUL_WEBHOOK_EVENT_TYPES: readonly PrintfulWebhookEventType[] = [
  "order_created",
  "order_updated",
  "shipment_sent",
  "shipment_delivered",
];
