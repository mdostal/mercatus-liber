import type { FulfillmentLineRecord, FulfillmentLineStatus, FulfillmentRecipient } from "@mercatus-liber/fulfillment";
import { SLANT3D_PROVIDER } from "./provider.js";
import type { Slant3dAddress, Slant3dOrder, Slant3dOrderItem } from "./slant3d-types.js";

/**
 * What a SKU is made from at Slant: an uploaded model file and a filament
 * (material and colour). Slant has no product catalog of its own, so every
 * SKU sent here needs one of these.
 */
export interface Slant3dCatalogTarget {
  /** The file's publicFileServiceId, from uploading it. */
  fileId: string;
  /** A filament's publicId, from listFilaments. */
  filamentId: string;
}

/** Who an order ships to, in Slant's field names. All optional so a partial address can be checked before sending. */
export interface Slant3dRecipient {
  email?: string;
  address: Partial<Slant3dAddress>;
}

export function mapRecipientToSlant3d(recipient: FulfillmentRecipient): Slant3dRecipient {
  return {
    email: recipient.email,
    address: {
      name: recipient.name,
      ...(recipient.street1 !== undefined ? { line1: recipient.street1 } : {}),
      ...(recipient.street2 !== undefined ? { line2: recipient.street2 } : {}),
      ...(recipient.city !== undefined ? { city: recipient.city } : {}),
      ...(recipient.stateCode !== undefined ? { state: recipient.stateCode } : {}),
      ...(recipient.postalCode !== undefined ? { zip: recipient.postalCode } : {}),
      ...(recipient.countryCode !== undefined ? { country: recipient.countryCode } : {}),
    },
  };
}

/** Thrown before calling Slant when a recipient lacks a field Slant needs to ship. */
export class IncompleteRecipientError extends Error {
  constructor(readonly missing: string[]) {
    super(`The shipping address is missing ${missing.join(", ")}, which Slant 3D needs to ship.`);
    this.name = "IncompleteRecipientError";
  }
}

/**
 * Checks for every field Slant's spec marks required on a draft: the email and
 * the address's name, line1, city, state, zip and country. The docs call state
 * optional; this follows the spec, so an address with no state or region is
 * refused. Returns the recipient with those fields trimmed.
 */
export function assertShippableRecipient(recipient: Slant3dRecipient): { email: string; address: Slant3dAddress } {
  const { address } = recipient;
  const fields = ["name", "line1", "city", "state", "zip", "country"] as const;
  const missing: string[] = fields.filter((key) => !address[key]?.trim());
  if (!recipient.email?.trim()) missing.push("email");
  if (missing.length > 0) throw new IncompleteRecipientError(missing);
  const line2 = address.line2?.trim();
  return {
    email: recipient.email!.trim(),
    address: {
      name: address.name!.trim(),
      line1: address.line1!.trim(),
      ...(line2 ? { line2 } : {}),
      city: address.city!.trim(),
      state: address.state!.trim(),
      zip: address.zip!.trim(),
      country: address.country!.trim(),
    },
  };
}

/**
 * Slant's five order statuses onto this framework's five line statuses:
 *
 * - DRAFT -> "held": drafted but not processed, so nothing is charged or made.
 * - SUBMITTED, PRINTING -> "submitted": paid, and waiting to print or printing.
 * - SHIPPED -> "shipped".
 * - CANCELLED -> "unfulfilled": Slant won't make it, and there is no cancelled
 *   line status to report instead.
 *
 * Nothing maps to "delivered". Slant's order status stops at SHIPPED; delivery
 * is only announced by the order.delivered webhook. An unrecognized status is
 * reported as "submitted".
 */
export function mapSlant3dOrderStatus(status: string): FulfillmentLineStatus {
  switch (status.toUpperCase()) {
    case "DRAFT":
      return "held";
    case "SHIPPED":
      return "shipped";
    case "CANCELLED":
      return "unfulfilled";
    default:
      return "submitted";
  }
}

/** The SKU id sent with an item when the order was drafted, if Slant returned it. */
function skuOf(item: Slant3dOrderItem): string | null {
  return item.SKU || item.printItem?.SKU || null;
}

/**
 * One record per order item. Status and tracking are per order at Slant, so
 * every line of an order reports the same ones. With several tracking numbers,
 * the first is reported. Slant gives no tracking URL.
 *
 * `fallbackSkuIds` are used, by position, for items Slant returned without a SKU.
 */
export function buildSlant3dLineRecords(orderId: string, order: Slant3dOrder, fallbackSkuIds: string[] = []): FulfillmentLineRecord[] {
  const status = mapSlant3dOrderStatus(order.status);
  const trackingNumber = order.fulfillment?.trackingNumbers?.[0] ?? null;
  return order.items.map((item, index) => ({
    orderId,
    skuId: skuOf(item) ?? fallbackSkuIds[index] ?? `slant3d-item-${index}`,
    provider: SLANT3D_PROVIDER,
    externalOrderId: order.publicId,
    status,
    trackingNumber,
    trackingUrl: null,
  }));
}

/**
 * Converts a Slant USD amount to whole cents without float arithmetic. Slant
 * sends order costs as two-decimal strings ("4.06") and estimates as JSON
 * numbers (17.75); both go through their decimal text. Anything past two
 * decimals is rounded half up, which Slant's sources don't specify.
 */
export function slant3dUsdToCents(amount: number | string): number {
  let text = typeof amount === "number" ? String(amount) : amount.trim();
  // Very small or large numbers print in exponent form; write them out in full.
  if (typeof amount === "number" && /e/i.test(text)) text = amount.toFixed(6);
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match || (typeof amount === "number" && !Number.isFinite(amount))) throw new Error(`Not a Slant 3D dollar amount: ${JSON.stringify(amount)}`);
  const [, sign = "", whole = "0", fraction = ""] = match;
  const padded = `${fraction}000`;
  const cents = Number(whole) * 100 + Number(padded.slice(0, 2)) + (Number(padded[2]) >= 5 ? 1 : 0);
  return sign && cents !== 0 ? -cents : cents;
}
