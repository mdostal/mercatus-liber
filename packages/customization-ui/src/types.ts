/**
 * Local types, a separate copy of @mercatus-liber/customization's shapes.
 * To be replaced with imports from that package.
 */

export type AvailabilityStatus = "active" | "discontinued" | "request";

export interface PaletteColor {
  id: string;
  label: string;
  hex: string;
  status?: AvailabilityStatus;
  note?: string;
}

export type FinishColorMode = "single" | "palette" | "any";

export interface FinishTier {
  id: string;
  rank: number;
  label: string;
  colors: FinishColorMode;
  description: string;
  status?: AvailabilityStatus;
  note?: string;
  /** Minor units over the product's base price. Per-product overrides (ProductCustomization.finishPriceDeltas in shop-5c's design) are resolved by the caller before this package ever sees the tier -- this package only renders whatever delta it's given. */
  priceDeltaCents?: number;
}

export interface ColorRegion {
  id: string;
  label: string;
  default: string;
  separable: boolean;
  parent?: string;
  allowed?: string[];
  why?: string;
}

export interface CustomizableProduct {
  id: string;
  label: string;
  finishes: string[];
  regions: ColorRegion[];
  status?: AvailabilityStatus;
}

export interface ColorSelection {
  finishId: string;
  /** `__all` carries the single color when the active finish's colors mode is "single". */
  colors: Record<string, string>;
}
