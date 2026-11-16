/**
 * Buying carrier labels for orders the store ships itself, from the order admin.
 *
 * Labels are available when a label-selling shipping provider is registered
 * (SHIPPO_API_TOKEN or SHIPSTATION_API_KEY) and the store's own address is
 * set in the SHIP_FROM_* variables. With a Shippo test token the labels are
 * free samples, which is how the demo stores run.
 */
import type { Parcel, ShippingAddress } from "@mercatus-liber/shipping";

/** Why labels are off, in words an operator can act on, or null when they are on. */
export type ShipFromResult = { address: ShippingAddress } | { missing: string[] };

const REQUIRED = ["SHIP_FROM_NAME", "SHIP_FROM_STREET1", "SHIP_FROM_CITY", "SHIP_FROM_STATE", "SHIP_FROM_POSTAL_CODE", "SHIP_FROM_EMAIL"] as const;

/**
 * The store's ship-from address from the environment. SHIP_FROM_EMAIL is
 * required because USPS will not sell a label without a sender email, and
 * SHIP_FROM_PHONE because ShipStation requires a phone on every address; it
 * is optional here and only ShipStation will complain without it.
 * SHIP_FROM_COUNTRY defaults to US.
 */
export function shipFromAddressFromEnv(env: Record<string, string | undefined>): ShipFromResult {
  const value = (key: string): string => env[key]?.trim() ?? "";
  const missing = REQUIRED.filter((key) => !value(key));
  if (missing.length > 0) return { missing: [...missing] };
  return {
    address: {
      name: value("SHIP_FROM_NAME"),
      ...(value("SHIP_FROM_COMPANY") ? { company: value("SHIP_FROM_COMPANY") } : {}),
      street1: value("SHIP_FROM_STREET1"),
      ...(value("SHIP_FROM_STREET2") ? { street2: value("SHIP_FROM_STREET2") } : {}),
      city: value("SHIP_FROM_CITY"),
      state: value("SHIP_FROM_STATE"),
      postalCode: value("SHIP_FROM_POSTAL_CODE"),
      country: (value("SHIP_FROM_COUNTRY") || "US").toUpperCase(),
      email: value("SHIP_FROM_EMAIL"),
      ...(value("SHIP_FROM_PHONE") ? { phone: value("SHIP_FROM_PHONE") } : {}),
    },
  };
}

/**
 * A parcel from the label form's fields. Every carrier needs a weight; Shippo
 * also needs all three dimensions, so the form asks for them. Returns what is
 * wrong instead of a parcel when a number is missing or not positive.
 */
export function parcelFromForm(fields: { weightOz?: string | null; lengthIn?: string | null; widthIn?: string | null; heightIn?: string | null }): { parcel: Parcel } | { error: string } {
  const number = (raw: string | null | undefined): number => Number((raw ?? "").trim());
  const weightOz = number(fields.weightOz);
  const dims = [number(fields.lengthIn), number(fields.widthIn), number(fields.heightIn)];
  if (!Number.isFinite(weightOz) || weightOz <= 0) return { error: "Enter the parcel's weight in ounces." };
  if (dims.some((dim) => !Number.isFinite(dim) || dim <= 0)) return { error: "Enter the box's length, width and height in inches." };
  if (weightOz > 1120 || dims.some((dim) => dim > 108)) return { error: "That is larger than a carrier parcel (70 lb, 108 in). Check the numbers." };
  return { parcel: { weightOz, lengthIn: dims[0]!, widthIn: dims[1]!, heightIn: dims[2]! } };
}

/** Whether a link a bought label left can still be voided: it has a label id and its lines are still "shipped", not delivered. */
export function voidableLabelIds(links: { meta?: Record<string, string>; status: string | null }[]): string[] {
  return links.filter((link) => link.meta?.labelId && link.status === "shipped").map((link) => link.meta!.labelId!);
}
