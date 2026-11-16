import type { FulfillmentLineRecord, FulfillmentLineStatus, FulfillmentRecipient, ProviderOrderStatusUpdate } from "@mercatus-liber/fulfillment";
import { X3D_PROVIDER } from "./provider.js";
import { X3D_COUNTRIES, X3D_FILE_EXTENSIONS, X3D_MATERIALS, X3D_NOZZLE_DIAMETERS, X3D_QUALITIES, type X3dMaterial, type X3dNozzleDiameter, type X3dOrder, type X3dQuality } from "./x3d-types.js";

/**
 * X3D's nine order statuses onto this framework's five line statuses:
 *
 * - PENDING_PAYMENT -> "held": the order exists but no money was taken and nothing prints until it is paid.
 * - RECEIVED, ACCEPTED, PRINTING, PRINTED -> "submitted".
 * - SHIPPED -> "shipped", DELIVERED -> "delivered".
 * - CANCELLED, REJECTED -> "unfulfilled": X3D will not make it.
 *
 * A status this package does not know is reported as "submitted".
 */
export function mapX3dOrderStatus(status: string): FulfillmentLineStatus {
  switch (status.toUpperCase()) {
    case "PENDING_PAYMENT":
      return "held";
    case "SHIPPED":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "CANCELLED":
    case "REJECTED":
      return "unfulfilled";
    default:
      return "submitted";
  }
}

/** One record per line the X3D order makes. X3D gives a tracking number and carrier, not a tracking URL. */
export function buildX3dLineRecords(orderId: string, skuIds: string[], order: { code: string; status: string; tracking?: X3dOrder["tracking"] }): FulfillmentLineRecord[] {
  return skuIds.map((skuId) => ({
    orderId,
    skuId,
    provider: X3D_PROVIDER,
    externalOrderId: order.code,
    status: mapX3dOrderStatus(order.status),
    trackingNumber: order.tracking?.number ?? null,
    trackingUrl: null,
  }));
}

/** An order as read back from X3D, as the status update @mercatus-liber/fulfillment's createProviderOrderStatusRecorder takes. */
export function x3dOrderStatusUpdateFrom(order: X3dOrder): ProviderOrderStatusUpdate {
  return { externalOrderId: order.code, status: mapX3dOrderStatus(order.status), trackingNumber: order.tracking?.number ?? null, carrier: order.tracking?.carrier ?? null };
}

/** Thrown before calling X3D when the address lacks a field X3D requires. */
export class X3dIncompleteRecipientError extends Error {
  constructor(readonly missing: string[]) {
    super(`The shipping address is missing ${missing.join(", ")}, which X3D Studios needs to ship.`);
    this.name = "X3dIncompleteRecipientError";
  }
}

/** Thrown before calling X3D when the country is not one its order endpoint accepts. */
export class X3dDestinationNotServedError extends Error {
  constructor(readonly countryCode: string) {
    super(`X3D Studios does not ship to "${countryCode}". It accepts: ${X3D_COUNTRIES.join(", ")}.`);
    this.name = "X3dDestinationNotServedError";
  }
}

export interface X3dAddress {
  recipientName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

/**
 * The address fields X3D requires: name, street, city, state and postal code.
 * A missing country is sent as "US", X3D's own default. Refuses a country X3D
 * does not ship to, so nothing is charged for a parcel that cannot be sent.
 */
export function mapRecipientToX3d(recipient: FulfillmentRecipient): X3dAddress {
  const fields = { name: recipient.name, street1: recipient.street1, city: recipient.city, stateCode: recipient.stateCode, postalCode: recipient.postalCode };
  const missing = Object.entries(fields)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  if (missing.length > 0) throw new X3dIncompleteRecipientError(missing);
  const country = (recipient.countryCode?.trim() || "US").toUpperCase();
  if (!(X3D_COUNTRIES as readonly string[]).includes(country)) throw new X3dDestinationNotServedError(country);
  const street2 = recipient.street2?.trim();
  const phone = recipient.phone?.trim();
  return {
    recipientName: recipient.name.trim(),
    street1: recipient.street1!.trim(),
    ...(street2 ? { street2 } : {}),
    city: recipient.city!.trim(),
    state: recipient.stateCode!.trim(),
    zip: recipient.postalCode!.trim(),
    country,
    ...(phone ? { phone } : {}),
  };
}

/**
 * What a SKU prints as at X3D. Stored as the `target` of the SKU's provider
 * catalog mapping.
 *
 * Give `fileUrl` (a URL the store can fetch the model from at order time) or
 * `modelUrl` (the `gs://` URI of a model X3D already holds for the account).
 *
 * For a multicolour print, the file must be a `.gcode.3mf` already sliced for
 * X3D's printers with the colours assigned: that is the only multicolour input
 * X3D's API documents. `color` then does not choose the colours; the slice
 * does. For a single-colour print, `color` is a stock spool name or hex.
 */
export interface X3dCatalogTarget {
  fileUrl?: string;
  modelUrl?: string;
  /** The name X3D sees, which sets how it reads the file. Defaults to the last path segment of `fileUrl`. */
  fileName?: string;
  material?: X3dMaterial;
  color?: string;
  quality?: X3dQuality;
  infill?: number;
  nozzleDiameter?: X3dNozzleDiameter;
  layerHeight?: number;
  note?: string;
}

/** The file name X3D will see for a target, or null when it has none (a `modelUrl` target). */
export function x3dFileNameFor(target: X3dCatalogTarget): string | null {
  if (target.fileName) return target.fileName;
  if (!target.fileUrl) return null;
  try {
    return decodeURIComponent(new URL(target.fileUrl).pathname.split("/").pop() ?? "") || null;
  } catch {
    return null;
  }
}

/** True when the file is an already-sliced Bambu project, the form X3D prints in several colours. */
export function isSlicedX3dFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".gcode.3mf");
}

/** Checks a stored mapping target is usable. Returns the target, or the reason it is not. */
export function parseX3dCatalogTarget(target: Record<string, unknown>): { ok: true; target: X3dCatalogTarget } | { ok: false; reason: string } {
  const text = (key: string): string | undefined => (typeof target[key] === "string" && target[key] !== "" ? (target[key] as string) : undefined);
  const number = (key: string): number | undefined => (typeof target[key] === "number" && Number.isFinite(target[key]) ? (target[key] as number) : undefined);
  const fileUrl = text("fileUrl");
  const modelUrl = text("modelUrl");
  if (!fileUrl && !modelUrl) return { ok: false, reason: "fileUrl or modelUrl must be set" };
  if (fileUrl && modelUrl) return { ok: false, reason: "set fileUrl or modelUrl, not both" };
  if (modelUrl && !modelUrl.startsWith("gs://")) return { ok: false, reason: "modelUrl must be a gs:// URI of a model X3D holds" };
  const material = text("material");
  if (material !== undefined && !(X3D_MATERIALS as readonly string[]).includes(material)) return { ok: false, reason: `material must be one of ${X3D_MATERIALS.join(", ")}` };
  const quality = text("quality");
  if (quality !== undefined && !(X3D_QUALITIES as readonly string[]).includes(quality)) return { ok: false, reason: `quality must be one of ${X3D_QUALITIES.join(", ")}` };
  const nozzleDiameter = number("nozzleDiameter");
  // X3D silently prints an unlisted nozzle size at 0.4 mm, so it is refused here instead.
  if (nozzleDiameter !== undefined && !(X3D_NOZZLE_DIAMETERS as readonly number[]).includes(nozzleDiameter)) return { ok: false, reason: `nozzleDiameter must be one of ${X3D_NOZZLE_DIAMETERS.join(", ")}` };
  const parsed: X3dCatalogTarget = {
    ...(fileUrl ? { fileUrl } : {}),
    ...(modelUrl ? { modelUrl } : {}),
    ...(text("fileName") ? { fileName: text("fileName")! } : {}),
    ...(material ? { material: material as X3dMaterial } : {}),
    ...(text("color") ? { color: text("color")! } : {}),
    ...(quality ? { quality: quality as X3dQuality } : {}),
    ...(number("infill") !== undefined ? { infill: number("infill")! } : {}),
    ...(nozzleDiameter !== undefined ? { nozzleDiameter: nozzleDiameter as X3dNozzleDiameter } : {}),
    ...(number("layerHeight") !== undefined ? { layerHeight: number("layerHeight")! } : {}),
    ...(text("note") ? { note: text("note")! } : {}),
  };
  if (fileUrl) {
    const fileName = x3dFileNameFor(parsed);
    if (!fileName || !X3D_FILE_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension))) {
      return { ok: false, reason: `the file name must end in one of ${X3D_FILE_EXTENSIONS.join(", ")}; set fileName when the URL does not` };
    }
  }
  return { ok: true, target: parsed };
}
