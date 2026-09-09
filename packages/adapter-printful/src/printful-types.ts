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
 * genuinely UNCONFIRMABLE from public docs, disclosed honestly per the story's own
 * explicit fallback instruction. Every source checked in this research pass came up
 * empty on the actual mechanism:
 *   - the real OpenAPI-generated webhook models (`Webhook`, `WebhookInfoRequest`,
 *     `WebhookInfoResponse`, `WebhookOrderData`, `WebhookShipmentData` in the same
 *     generated client) are all empty `{}` stubs in Printful's own spec -- Printful
 *     has not published a formal schema for the webhook payload or any
 *     signature/header field at all;
 *   - developers.printful.com/docs/v2-preview/ states only that v2 webhooks add
 *     "more secure Webhooks by enforcing HTTPS, added expiration date, and request
 *     signing" -- naming the *feature*, never the header, algorithm, or
 *     secret-retrieval mechanism;
 *   - three independent third-party Printful API clients checked
 *     (spencerlepine/printful-sdk-js-v2, artT14/printful-sdk-js, and the Craft CMS
 *     plugin found via search) implement webhook *configuration* endpoints but
 *     NONE implements signature verification -- consistent with there being nothing
 *     public to implement it against.
 * `handleWebhookEvent` below therefore refuses (fails closed) to process a webhook
 * unless the caller supplies its own `verifyWebhookSignature`, rather than trusting
 * an unverified payload or guessing at a scheme -- see index.ts's doc comment on
 * `PrintfulWebhookSignatureUnconfirmedError`.
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
