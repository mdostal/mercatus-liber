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

/** A provider's print area, such as one from adapter-printful's getPrintAreas. */
export interface PrintAreaSpec {
  /** The provider's placement key, e.g. "front" or "sleeve_left". */
  key: string;
  widthInches: number;
  heightInches: number;
  dpi: number;
  technique?: string;
}

/** A layout made from a provider's print area, remembering the placement it came from. */
export interface ProviderPrintLayout extends PrintLayout {
  placement: string;
  technique?: string;
  dpi: number;
}

/**
 * Layouts from a provider's print areas, so print files are drawn at exactly
 * the size the provider wants (Printful's front on a Bella+Canvas 3001: 12 x 16
 * in at 150 dpi, 1800 x 2400 px). Placement keys become layout ids with "_"
 * turned into "-" ("sleeve_left" -> "sleeve-left"). When two areas share a
 * placement (one per technique), the later ones get the technique appended
 * ("front-dtfilm"), and any further clash is skipped; pass `technique` to keep
 * only one technique's areas.
 */
export function layoutsFromPrintAreas(areas: readonly PrintAreaSpec[], options: { technique?: string } = {}): Record<string, ProviderPrintLayout> {
  const layouts: Record<string, ProviderPrintLayout> = {};
  for (const area of areas) {
    if (options.technique && area.technique !== options.technique) continue;
    const base = area.key.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
    let id = base;
    if (layouts[id]) id = `${base}-${(area.technique ?? "alt").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (layouts[id] || !LAYOUT_ID.test(id)) continue;
    layouts[id] = {
      id,
      inches: [area.widthInches, area.heightInches],
      px: [Math.round(area.widthInches * area.dpi), Math.round(area.heightInches * area.dpi)],
      placement: area.key,
      dpi: area.dpi,
      ...(area.technique ? { technique: area.technique } : {}),
    };
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
