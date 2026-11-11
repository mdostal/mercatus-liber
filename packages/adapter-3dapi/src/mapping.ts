import { createHash } from "node:crypto";
import type { FulfillmentLineStatus, FulfillmentRecipient } from "@mercatus-liber/fulfillment";
import type { DapiCustomerInput, DapiOrderLineExtra, DapiOrderLineInput, DapiOrderLineMaterials, DapiOrderStatus, DapiShippingAddressInput } from "./dapi-types.js";

/**
 * What a SKU is made from at 3DAPI: one quote (a priced model file) and the
 * materials to print it in. Set `materials` or `useSuggestedMaterials`, never
 * both: 3DAPI refuses a line that sends both.
 *
 * 3DAPI's spec marks both as optional and does not say what an order line with
 * neither does, so this package refuses such a target instead of finding out
 * with a paid order.
 */
export interface DapiCatalogTarget {
  /** A `qte_...` id whose status is "ready". */
  quoteId: string;
  /** `[{ slot, material }]` for every slot the quote's file prints with, or plain `mat_...` ids for slots 1, 2, 3... */
  materials?: DapiOrderLineMaterials;
  /** Print in the quote's `suggested_materials`. */
  useSuggestedMaterials?: true;
  /** Bought-in parts shipped with every unit. Each must be one of your extras, approved by 3DAPI. */
  extras?: { extra: string; quantityPerUnit: number }[];
}

const QUOTE_ID = /^qte_[0-9A-Za-z]+$/;
const MATERIAL_ID = /^mat_[0-9A-Za-z]+$/;
const EXTRA_ID = /^xtr_[0-9A-Za-z]+$/;
const isSlot = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 16;

/**
 * Checks a stored mapping against what the spec says an order line accepts and
 * returns it as a DapiCatalogTarget, or returns the reason it is not one.
 */
export function parseDapiCatalogTarget(target: Record<string, unknown>): { ok: true; target: DapiCatalogTarget } | { ok: false; reason: string } {
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
  if (typeof target.quoteId !== "string" || !QUOTE_ID.test(target.quoteId)) return fail("quoteId must be a 3DAPI quote id (qte_...)");

  const suggested = target.useSuggestedMaterials;
  if (suggested !== undefined && suggested !== true) return fail("useSuggestedMaterials must be true or left out");
  const materials = target.materials;
  if (materials !== undefined && suggested === true) return fail("set materials or useSuggestedMaterials, not both");
  if (materials === undefined && suggested !== true) return fail("set materials or useSuggestedMaterials");

  const result: DapiCatalogTarget = { quoteId: target.quoteId };
  if (suggested === true) result.useSuggestedMaterials = true;
  if (materials !== undefined) {
    if (!Array.isArray(materials) || materials.length < 1 || materials.length > 16) return fail("materials must list 1 to 16 materials");
    if (materials.every((m) => typeof m === "string" && MATERIAL_ID.test(m))) {
      result.materials = materials as string[];
    } else if (materials.every((m) => typeof m === "object" && m !== null && isSlot((m as { slot?: unknown }).slot) && typeof (m as { material?: unknown }).material === "string" && MATERIAL_ID.test((m as { material: string }).material))) {
      result.materials = (materials as { slot: number; material: string }[]).map((m) => ({ slot: m.slot, material: m.material }));
    } else {
      return fail("materials must be all material ids (mat_...) or all { slot, material }");
    }
  }

  if (target.extras !== undefined) {
    const extras = target.extras;
    if (!Array.isArray(extras) || extras.length > 20) return fail("extras must list at most 20 extras");
    const valid = extras.every((e) => {
      if (typeof e !== "object" || e === null) return false;
      const { extra, quantityPerUnit } = e as { extra?: unknown; quantityPerUnit?: unknown };
      return typeof extra === "string" && EXTRA_ID.test(extra) && typeof quantityPerUnit === "number" && Number.isInteger(quantityPerUnit) && quantityPerUnit >= 1 && quantityPerUnit <= 100;
    });
    if (!valid) return fail("each extra needs an extra id (xtr_...) and a quantityPerUnit from 1 to 100");
    result.extras = (extras as { extra: string; quantityPerUnit: number }[]).map((e) => ({ extra: e.extra, quantityPerUnit: e.quantityPerUnit }));
  }
  return { ok: true, target: result };
}

/** One order line for POST /v2/integrator/orders. */
export function toDapiOrderLine(target: DapiCatalogTarget, quantity: number): DapiOrderLineInput {
  const extras: DapiOrderLineExtra[] | undefined = target.extras?.map((e) => ({ extra: e.extra, quantity_per_unit: e.quantityPerUnit }));
  return {
    quote: target.quoteId,
    quantity,
    ...(target.materials !== undefined ? { materials: target.materials } : {}),
    ...(target.useSuggestedMaterials ? { use_suggested_materials: true as const } : {}),
    ...(extras && extras.length > 0 ? { extras } : {}),
  };
}

/** Where and to whom an order ships, in 3DAPI's field names. Fields the order did not have are left out. */
export interface DapiRecipient {
  shipping_address: Partial<DapiShippingAddressInput>;
  customer: Partial<DapiCustomerInput>;
}

/**
 * Maps a Mercatus recipient to 3DAPI's `shipping_address` and `customer`.
 * The country code is uppercased because 3DAPI only accepts uppercase.
 * `FulfillmentRecipient.address` (free text) is not sent: 3DAPI has no field for it.
 */
export function mapRecipientToDapi(recipient: FulfillmentRecipient): DapiRecipient {
  return {
    shipping_address: {
      ...(recipient.street1 !== undefined ? { line1: recipient.street1 } : {}),
      ...(recipient.street2 ? { line2: recipient.street2 } : {}),
      ...(recipient.city !== undefined ? { city: recipient.city } : {}),
      ...(recipient.stateCode ? { state: recipient.stateCode } : {}),
      ...(recipient.postalCode !== undefined ? { postal_code: recipient.postalCode } : {}),
      ...(recipient.countryCode !== undefined ? { country_code: recipient.countryCode.trim().toUpperCase() } : {}),
    },
    customer: {
      name: recipient.name,
      email: recipient.email,
      ...(recipient.phone ? { phone: recipient.phone } : {}),
    },
  };
}

/** Thrown before calling 3DAPI when a recipient lacks a field the order needs. */
export class IncompleteRecipientError extends Error {
  constructor(readonly missing: string[]) {
    super(`The shipping details are missing ${missing.join(", ")}, which 3DAPI needs to ship.`);
    this.name = "IncompleteRecipientError";
  }
}

/**
 * Refuses a recipient without a street line, city, postal code, country, name
 * or email, and returns it fully typed otherwise.
 *
 * 3DAPI itself requires line1, city, country_code, customer name and customer
 * email. It allows a missing postal code "where the country has none"; this
 * package requires one anyway, as the Printful adapter does, so an order for a
 * country without postal codes is refused here.
 */
export function assertShippableRecipient(recipient: DapiRecipient): { shipping_address: DapiShippingAddressInput; customer: DapiCustomerInput } {
  const { shipping_address: address, customer } = recipient;
  const missing: string[] = [];
  if (!address.line1?.trim()) missing.push("line1");
  if (!address.city?.trim()) missing.push("city");
  if (!address.postal_code?.trim()) missing.push("postal_code");
  if (!address.country_code?.trim()) missing.push("country_code");
  if (!customer.name?.trim()) missing.push("name");
  if (!customer.email?.trim()) missing.push("email");
  if (missing.length > 0) throw new IncompleteRecipientError(missing);
  return { shipping_address: address as DapiShippingAddressInput, customer: customer as DapiCustomerInput };
}

/**
 * Maps every 3DAPI order status to a FulfillmentLineStatus. 3DAPI has ten
 * statuses and Mercatus has five, with no failed, returned or cancelled state,
 * so four of these narrow:
 *
 * - `awaiting_payment` -> "held". The order exists but nothing is made until it
 *   is paid. Only checkout-mode orders have this status; the wallet-mode orders
 *   this adapter places come back `paid`.
 * - `on_hold` -> "submitted". 3DAPI describes it as "not enough stock to fulfil
 *   it". The order is paid and with 3DAPI, so it is not "held" in the Mercatus
 *   sense (nothing made or charged).
 * - `rejected` -> "submitted". A production partner refused it; 3DAPI says it
 *   then reassigns the order or cancels and refunds it, so a later status follows.
 * - `returned` -> "shipped". It left the production centre and came back; it
 *   was never delivered.
 * - `cancelled` -> "unfulfilled". 3DAPI refunds a cancelled order in full and
 *   nothing ships.
 *
 * `completed` is 3DAPI's "delivered and settled", so it maps to "delivered".
 */
export function mapDapiOrderStatus(status: DapiOrderStatus): FulfillmentLineStatus {
  switch (status) {
    case "awaiting_payment":
      return "held";
    case "paid":
    case "assigned":
    case "in_production":
    case "on_hold":
    case "rejected":
      return "submitted";
    case "shipped":
    case "returned":
      return "shipped";
    case "completed":
      return "delivered";
    case "cancelled":
      return "unfulfilled";
  }
}

const REFERENCE = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * The `reference` an order is created and later found with. A Mercatus order
 * id that fits 3DAPI's pattern (letters, digits, `_` and `-`, up to 100
 * characters; a UUID fits) is used as it is. Any other id becomes `ml-` plus
 * the first 40 hex characters of its SHA-256, which is stable but not readable.
 */
export function dapiReferenceForOrder(orderId: string): string {
  if (REFERENCE.test(orderId)) return orderId;
  return `ml-${createHash("sha256").update(orderId).digest("hex").slice(0, 40)}`;
}

/**
 * The `Idempotency-Key` for placing an order. `attempt` is how many orders
 * with this reference 3DAPI already has (all of them cancelled, or the adapter
 * would not be ordering), so a retry of the same attempt repeats the key and a
 * fresh order after a cancellation gets a new one.
 *
 * `retry` is how many times placing this order ended in a 5xx. 3DAPI stores a
 * 5xx answer under its key and returns it again for 24 hours, and its docs say
 * to "check the resource before retrying with a new key". The adapter does
 * that check, then moves to a new key by raising `retry`.
 */
export function dapiIdempotencyKeyForOrder(reference: string, attempt: number, retry = 0): string {
  return `mercatus-liber:order:${reference}:${attempt}${retry > 0 ? `:r${retry}` : ""}`;
}
