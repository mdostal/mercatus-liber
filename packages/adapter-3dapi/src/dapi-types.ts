/**
 * Shapes of 3DAPI's v2 API (https://public-api.dapi.digital), as far as this
 * package reads or writes them. Every field here was taken from 3DAPI's
 * OpenAPI 3.1 document and docs pages read on 2026-11-10. Nothing in this
 * package has been run against a live 3DAPI account: 3DAPI has no sandbox.
 *
 * Only the integrator side of the API is covered. Designer endpoints
 * (/v2/products, /v2/orders) refuse integrator keys with `actor_not_allowed`.
 */

/** `amount` is an integer in the smallest currency unit (cents). `currency` is lowercase; 3DAPI says every amount is "usd" today. */
export interface DapiMoney {
  amount: number;
  currency: string;
}

/** A cursor page. Pass `next_cursor` back unchanged as `cursor`. */
export interface DapiList<T> {
  object: "list";
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** The body of every 3DAPI error response. `code` is the stable field to branch on. */
export interface DapiErrorBody {
  status_code: number;
  error: string;
  code: string;
  message: string;
  details: unknown;
}

/** Every order status in the spec, for designer and integrator orders alike. */
export const DAPI_ORDER_STATUSES = ["awaiting_payment", "paid", "assigned", "in_production", "shipped", "completed", "on_hold", "rejected", "returned", "cancelled"] as const;
export type DapiOrderStatus = (typeof DAPI_ORDER_STATUSES)[number];

export interface DapiMaterialRef {
  /** null for a custom material that is not in the catalog. */
  id: string | null;
  object: "material";
  name: string;
}

export interface DapiOrderItem {
  id: string;
  object: "order_item";
  quote: { id: string; object: "quote"; name: string };
  /** The materials loaded, in slot order. */
  materials: DapiMaterialRef[];
  material_slots: { slot: number; material: DapiMaterialRef }[];
  quantity: number;
  /** In wallet mode, the production price per unit. */
  unit_price: DapiMoney;
  /** The quote price per unit at this quantity plus extras. Includes 3DAPI's platform fee. */
  production_unit_price: DapiMoney;
  extras: { extra: { id: string; object: "extra"; name: string }; quantity_per_unit: number }[];
  total: DapiMoney;
}

/** An integrator order, as POST /v2/integrator/orders and GET /v2/integrator/orders/{id} return it. */
export interface DapiOrder {
  id: string;
  object: "order";
  /** Human-readable number, the one 3DAPI support uses. Wallet orders start `2AP`. */
  number: string;
  channel: "integrator_checkout" | "integrator_wallet";
  status: DapiOrderStatus;
  /** null unless the API key has the `orders:read_customer` scope. */
  customer: { name: string; email: string | null; phone: string | null; company: unknown } | null;
  shipping_address: { formatted: string | null; city: string | null; country: string | null; country_code: string | null };
  charges: {
    paid_by: "buyer" | "you" | "dapi";
    items: DapiMoney;
    shipping: DapiMoney;
    vat: { amount: DapiMoney; rate: number; included: boolean; country: string | null };
    sample_credit: DapiMoney | null;
    /** The full charge, VAT included, before any sample credit. */
    total: DapiMoney;
  };
  /** null on wallet orders, which the store pays for itself. */
  earnings: unknown;
  shipping: {
    tier: "small" | "medium" | "large" | null;
    /** A plain name such as "DHL". Set once shipped. */
    carrier: string | null;
    tracking_number: string | null;
    shipped_at: string | null;
  };
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
  mode: "checkout" | "wallet";
  checkout: unknown;
  item_count: number;
  /** In lists, only present with `expand[]=items`. */
  items?: DapiOrderItem[];
  refunds: { id: string; amount: DapiMoney; created_at: string }[];
  /** The `reference` sent when the order was created. */
  reference: string | null;
}

/** Which material goes in which extruder slot: `[{ slot, material }]`, or plain material ids for slots 1, 2, 3... */
export type DapiOrderLineMaterials = string[] | { slot: number; material: string }[];

export interface DapiOrderLineExtra {
  extra: string;
  quantity_per_unit: number;
}

/** One line of POST /v2/integrator/orders. Send `materials` or `use_suggested_materials`, not both. */
export interface DapiOrderLineInput {
  quote: string;
  quantity: number;
  materials?: DapiOrderLineMaterials;
  use_suggested_materials?: true;
  extras?: DapiOrderLineExtra[];
}

export interface DapiShippingAddressInput {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  /** ISO 3166-1 alpha-2, uppercase. */
  country_code: string;
}

export interface DapiCustomerInput {
  name: string;
  email: string;
  phone?: string | null;
}

/**
 * The wallet-mode body of POST /v2/integrator/orders. Checkout mode (the buyer
 * pays on a 3DAPI-hosted page) adds `checkout` and `unit_sales_price`; this
 * package never sends it.
 */
export interface DapiCreateOrderRequest {
  mode: "wallet";
  items: DapiOrderLineInput[];
  shipping_address: DapiShippingAddressInput;
  customer: DapiCustomerInput;
  /** Your own order id. Must match ^[a-zA-Z0-9_-]{1,100}$. */
  reference?: string;
  customer_notes?: string;
  use_sample_credit?: boolean;
}

export type DapiQuoteStatus = "processing" | "ready" | "failed";

export interface DapiSuggestedMaterial {
  slot: number;
  file_color: string | null;
  file_filament_type: string | null;
  material: DapiMaterialRef & { custom: boolean };
  /** How close the catalog material is to the colour in the file. */
  match: "exact" | "close" | "approximate";
}

/** A price for printing one model file. */
export interface DapiQuote {
  id: string;
  object: "quote";
  name: string;
  file: { name: string; size_bytes: number | null; download_url: string; production_version: unknown };
  status: DapiQuoteStatus;
  /** The production price of one unit. null until `status` is "ready". */
  price: DapiMoney | null;
  failure_reason: string | null;
  suggested_materials: DapiSuggestedMaterial[] | null;
  approval: { status: "not_submitted" | "in_review" | "approved" | "rejected"; reason: string | null };
  created_at: string;
  finished_at: string | null;
}

export interface DapiMaterial {
  id: string | null;
  object: "material";
  name: string;
  custom: boolean;
  technology: "fdm" | null;
  color: string | null;
  /** `#RRGGBB`, uppercase. */
  color_hex: string | null;
  /** Lowercase plastic family, e.g. "pla" or "petg". */
  filament_type: string | null;
}

/** A slot for one file. PUT the bytes to `upload_url` with `headers`, then use `id` in a write. */
export interface DapiUpload {
  id: string;
  object: "upload";
  purpose: string;
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_at: string;
}

export interface DapiShippingEstimate {
  object: "shipping_estimate";
  country_code: string;
  /** null when the order cannot be weighed yet and the flat rate applies. */
  zone: { code: string; name: string } | null;
  tier: "small" | "medium" | "large" | null;
  additional_items: number;
  /** Without VAT. */
  total: DapiMoney;
}

export interface DapiWallet {
  object: "wallet";
  balance: DapiMoney;
  sample_credit: DapiMoney;
  sample_credit_expires_at: string | null;
  pending_withdrawals: DapiMoney;
  updated_at: string;
}

/** GET /v2/me: who the key belongs to and what it may do. */
export interface DapiActor {
  object: "actor";
  user_id: string;
  kind: "designer" | "integrator";
  authenticated_with: "session" | "api_key" | "oauth";
  scopes: string[] | null;
  effective_scopes: string[] | null;
  /** Integrators only. Orders need "approved". */
  approval: "pending" | "approved" | "rejected" | null;
}

/** The event types an integrator webhook endpoint can subscribe to. */
export const DAPI_WEBHOOK_EVENT_TYPES = [
  "order.created",
  "order.paid",
  "order.assigned",
  "order.in_production",
  "order.shipped",
  "order.completed",
  "order.on_hold",
  "order.rejected",
  "order.returned",
  "order.cancelled",
  "checkout.expired",
  "quote.ready",
  "quote.failed",
  "quote.approved",
  "quote.rejected",
  "approval_request.approved",
  "approval_request.changes_requested",
] as const;
export type DapiWebhookEventType = (typeof DAPI_WEBHOOK_EVENT_TYPES)[number];

/** The JSON body of a webhook delivery. `data.object` is the order or quote as its GET endpoint returns it. */
export interface DapiWebhookPayload {
  id: string;
  object: "event";
  type: string;
  created_at: string;
  data: { object: unknown; previous: unknown; region: unknown };
}
