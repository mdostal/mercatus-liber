/**
 * Shapes of Slant 3D's v2 API (https://slant3dapi.com/v2/api), taken from two
 * sources read on 2026-11-10: Slant's OpenAPI file ("the spec") and the docs
 * site ("the docs"). Nothing here was checked against a live account. Where the
 * two sources disagree, the comment on the field says which one was followed.
 */

/** Order and item status. An item's status always matches its order's (spec). */
export const SLANT3D_ORDER_STATUSES = ["DRAFT", "SUBMITTED", "PRINTING", "SHIPPED", "CANCELLED"] as const;
export type Slant3dOrderStatus = (typeof SLANT3D_ORDER_STATUSES)[number];

/** Spec marks name, line1, city, state, zip and country required. The docs call state optional. */
export interface Slant3dAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  /** Two-letter ISO 3166 code (docs). */
  country: string;
}

export interface Slant3dPrintItemInput {
  type: "PRINT";
  publicFileServiceId: string;
  filamentId: string;
  quantity: number;
  /** In the docs' item table ("Optional item SKU, should be unique") and echoed on reads; not in the spec's request schema. */
  SKU?: string;
  /** In the docs' item table; not in the spec's request schema. */
  name?: string;
}

export interface Slant3dDraftOrderRequest {
  /** Required at the top level by the spec. */
  platformId: string;
  customer: {
    /** The docs' draft example carries the platform id here instead of at the top level, so it is sent in both places. */
    platformId?: string;
    details: { email: string; address: Slant3dAddress };
    /** Whose card is charged. Omitted, Slant charges the account's own card (docs). */
    publicPaymentServiceId?: string;
  };
  items: Slant3dPrintItemInput[];
  /** Docs only: at most 10 fields and 3 levels deep, and "some fields are reserved" (which ones is not said). */
  metadata?: Record<string, unknown>;
}

export interface Slant3dOrderItem {
  type: string;
  status?: string;
  /** Two-decimal USD string, e.g. "4.06". */
  price?: string;
  currency?: string;
  quantity?: number;
  SKU?: string | null;
  name?: string | null;
  publicFileServiceId?: string;
  filamentId?: string;
  printItem?: { filamentId?: string; publicFileServiceId?: string; SKU?: string | null; name?: string | null };
}

export interface Slant3dFulfillmentInfo {
  status?: string;
  /** Who is carrying the shipment (docs). */
  provider?: string;
  trackingNumbers?: string[];
  providerStatus?: string | null;
}

export interface Slant3dOrder {
  /** SLANT_XXXXXXXXXX. Used on every other order endpoint. */
  publicId: string;
  status: Slant3dOrderStatus | (string & {});
  /** Two-decimal USD strings. */
  printingCost?: string;
  deliveryCost?: string;
  paymentId?: string | null;
  processedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  /** The spec types this as a bare object; the fields above are from the docs. */
  fulfillment?: Slant3dFulfillmentInfo | null;
  items: Slant3dOrderItem[];
}

export interface Slant3dFilament {
  publicId: string;
  name: string;
  /** The filament's manufacturer. */
  provider: string;
  /** Material, upper case: "PLA", "PETG" or "OPM". */
  profile: string;
  /** Lower case, e.g. "matte black". */
  color: string;
  hexValue: string;
  imageURL?: string;
  /** Left out when Slant doesn't know. Filaments can go out of stock. */
  available?: boolean;
}

export interface Slant3dFile {
  publicFileServiceId: string;
  name?: string;
  ownerId?: string;
  platformId?: string;
  type?: string;
  notes?: string | null;
  fileURL?: string;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Slant3dPresignedUpload {
  /** Where to PUT the file. Expires after an hour. */
  presignedUrl: string;
  key: string;
  /** Sent back unchanged to confirm the upload. */
  filePlaceholder: Slant3dFile;
}

/** POST /files/{id}/estimate. All money fields are USD as JSON numbers. */
export interface Slant3dFileEstimate {
  subtotal: number;
  total: number;
  pricePerUnit: number;
  quantity: number;
  totalMaterial?: number;
  estimatedPrintTime?: number;
  bodyChargeCost?: number;
  oversizeSurcharge?: number;
}

export interface Slant3dPlatform {
  id: string;
  name: string;
  description?: string;
  url?: string;
  webhookURL?: string | null;
  /** Returned in full on every platform read. */
  webhookSecret?: string;
  enabled?: boolean;
}

/** `data` of POST /platforms/{id}/webhook/dummy: what the store's endpoint answered. */
export interface Slant3dWebhookDeliveryResult {
  success: boolean;
  response?: { status?: number; statusText?: string; body?: string; error?: string };
}

/** Every event_type in the spec. The docs' own event table lists only order.shipped and the catalog events. */
export const SLANT3D_WEBHOOK_EVENT_TYPES = [
  "order.created",
  "order.updated",
  "order.cancelled",
  "order.shipped",
  "order.delivered",
  "order.error",
  "payment.completed",
  "payment.failed",
  "customer.updated",
  "file.updated",
  "component.created",
  "component.updated",
  "component.deleted",
  "filament.updated",
] as const;
export type Slant3dWebhookEventType = (typeof SLANT3D_WEBHOOK_EVENT_TYPES)[number];
