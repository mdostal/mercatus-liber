/**
 * Shapes from X3D Studios' Print API, read from https://x3dstudios.com/openapi.json
 * (version 1.0.0) and https://x3dstudios.com/docs/api on 2026-11-15. Nothing
 * here has been checked against a live response.
 */

export const X3D_MATERIALS = ["pla", "petg", "abs", "asa", "tpu"] as const;
export type X3dMaterial = (typeof X3D_MATERIALS)[number];

export const X3D_QUALITIES = ["standard", "premium"] as const;
export type X3dQuality = (typeof X3D_QUALITIES)[number];

export const X3D_NOZZLE_DIAMETERS = [0.2, 0.4, 0.6, 0.8] as const;
export type X3dNozzleDiameter = (typeof X3D_NOZZLE_DIAMETERS)[number];

export type X3dShippingSpeed = "standard" | "express";

/** The countries the order endpoint accepts. Anywhere else is a 400. */
export const X3D_COUNTRIES = ["US", "AE", "AT", "AU", "BE", "CA", "CH", "DE", "DK", "ES", "FI", "FR", "GB", "IE", "IN", "IT", "JP", "MX", "NL", "NO", "NZ", "PT", "SE", "SG"] as const;

/** File extensions the order endpoint accepts. A `.gcode.3mf` counts as `.3mf`. */
export const X3D_FILE_EXTENSIONS = [".stl", ".glb", ".gcode", ".3mf"] as const;

/**
 * Every status an order can report. X3D says the usual path
 * (RECEIVED, ACCEPTED, PRINTING, PRINTED, SHIPPED, DELIVERED) is not enforced
 * and an operator can move an order backwards.
 */
export const X3D_ORDER_STATUSES = ["PENDING_PAYMENT", "RECEIVED", "ACCEPTED", "PRINTING", "PRINTED", "SHIPPED", "DELIVERED", "CANCELLED", "REJECTED"] as const;
export type X3dOrderStatus = (typeof X3D_ORDER_STATUSES)[number];

/** The print settings and address sent with an order. One order prints one model. */
export interface X3dCreateOrderFields {
  material?: X3dMaterial;
  quality?: X3dQuality;
  quantity: number;
  /** A stock spool name or hex. Anything off X3D's stock list is billed at the custom-colour rate. */
  color?: string;
  infill?: number;
  nozzleDiameter?: X3dNozzleDiameter;
  layerHeight?: number;
  /** Free text for X3D's operator. Cut at 1000 characters by X3D. */
  note?: string;
  recipientName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  shippingSpeed?: X3dShippingSpeed;
  /** One to five addresses that get X3D's order emails. Left out, X3D emails the account's own address. */
  emails?: string[];
  phone?: string;
}

/** The model to print: bytes to upload, or the `gs://` URI of a model X3D already holds for the account. */
export type X3dModelSource = { file: Blob; fileName: string } | { modelUrl: string };

/** What POST /api/print/orders returns with a 201. */
export interface X3dCreateOrderResponse {
  code: string;
  /** Print plus postage plus the second-AMS fee, in USD. The amount charged. */
  estimatedCost?: number;
  currency?: string;
  breakdown?: {
    print?: number;
    shipping?: number;
    shippingSpeed?: string;
    grams?: number;
    printHours?: number;
    /** 25, on a sliced plate that uses five or more filaments. */
    secondAmsFee?: number;
    /** How many filaments the plate uses. Present only with secondAmsFee. */
    colours?: number;
  };
  /** A page that needs no login, safe to give to the customer. */
  statusUrl?: string;
  status: string;
  /** False when the card was declined or the charge could not be confirmed. A 201 does not mean paid. */
  paid: boolean;
  charged?: number;
  paymentUrl?: string | null;
  /** "not-charged": the card was provably not charged. "unknown": it may have been. */
  chargeOutcome?: "not-charged" | "unknown";
  message?: string;
}

/** What GET /api/print/orders/{code} returns. */
export interface X3dOrder {
  code: string;
  status: string;
  statusLabel?: string;
  paid?: boolean;
  fileName?: string;
  material?: string;
  color?: string;
  quality?: string;
  quantity?: number;
  estimatedCost?: number;
  currency?: string;
  /** null until the parcel is handed over. `carrier` can be null. */
  tracking?: { number: string; carrier?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

/** POST /api/price. Prices one colour from a bounding box; a multicolour price only comes from a real slice. */
export interface X3dPriceRequest {
  bboxMm: { x: number; y: number; z: number };
  material?: X3dMaterial;
  quality?: X3dQuality;
  nozzle?: "standard" | "premium";
  quantity?: number;
  color?: string;
  shippingSpeed?: X3dShippingSpeed;
}

export interface X3dPriceResponse {
  grams: number;
  printHours: number;
  perUnit: number;
  /** The print line: per unit times quantity, bulk discount applied, rounded up to the whole dollar. */
  subtotal: number;
  /** US postage only. */
  shipping: number;
  total: number;
  pricePerGram: number;
  customColor: boolean;
}
