/**
 * A print area a provider accepts, such as Printful's 15 x 18 in large back:
 * its size in inches and the pixels of the print file it wants.
 */
export interface PrintLayout {
  /** Used in file names, so letters, digits, dots, `x` and `-` only, e.g. `back-15x18`. */
  id: string;
  inches: readonly [number, number];
  px: readonly [number, number];
}

const LAYOUT_ID = /^[a-z0-9][a-z0-9.x-]*$/;

/** Builds layouts from inches at one resolution (Printful's print files are 150 dpi). */
export function layoutsAtDpi(inchesById: Readonly<Record<string, readonly [number, number]>>, dpi: number): Record<string, PrintLayout> {
  const layouts: Record<string, PrintLayout> = {};
  for (const [id, inches] of Object.entries(inchesById)) {
    if (!LAYOUT_ID.test(id)) throw new Error(`Layout id "${id}" may use only lowercase letters, digits, ".", "x" and "-".`);
    layouts[id] = { id, inches, px: [Math.round(inches[0] * dpi), Math.round(inches[1] * dpi)] };
  }
  return layouts;
}

/** A garment laid flat, in inches: width across the chest seam to seam, length from the high point of the shoulder to the hem. */
export interface GarmentFlatSize {
  width: number;
  length: number;
}

export interface PrintCoverage {
  /** Percent of the garment's width the print covers, rounded. */
  widthPercent: number;
  /** Percent of the garment's length the print covers, rounded. */
  lengthPercent: number;
  /** False when the print is wider than the garment or runs past the hem from `topInches` down. */
  fits: boolean;
}

/** How much of a garment a print covers, placed `topInches` below the collar (3 in by default). */
export function printCoverage(garment: GarmentFlatSize, print: readonly [number, number], topInches = 3): PrintCoverage {
  return {
    widthPercent: Math.round((print[0] / garment.width) * 100),
    lengthPercent: Math.round((print[1] / garment.length) * 100),
    fits: print[0] <= garment.width && topInches + print[1] <= garment.length,
  };
}
