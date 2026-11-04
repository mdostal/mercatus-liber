import type { ColorRegion, ColorSelection, CustomizableProduct, FinishTier, PaletteColor } from "./types.js";

export function getFinishTier(finishes: FinishTier[], finishId: string): FinishTier | undefined {
  return finishes.find((f) => f.id === finishId);
}

export function paletteEntryByHex(palette: PaletteColor[], hex: string): PaletteColor | undefined {
  return palette.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
}

/**
 * What color a region actually gets under a chosen finish + selection.
 * Same resolution rules as the real manifest's own "rules" block: a
 * "single"-mode finish paints every region the one chosen color; a region
 * with separable=false under the separate/finished finishes follows its
 * parent's resolved color instead of having its own, recursively.
 */
export function resolveEffectiveColor(
  finishes: FinishTier[],
  product: CustomizableProduct,
  selection: ColorSelection,
  region: ColorRegion,
): string {
  const finish = getFinishTier(finishes, selection.finishId);
  if (finish?.colors === "single") return selection.colors.__all ?? region.default;
  if ((selection.finishId === "separate" || selection.finishId === "finished") && !region.separable && region.parent) {
    const parent = product.regions.find((r) => r.id === region.parent);
    if (parent) return resolveEffectiveColor(finishes, product, selection, parent);
  }
  return selection.colors[region.id] ?? region.default;
}

/**
 * Which palette colors a region shows under the active finish -- respects
 * an explicit `allowed` allow-list (e.g. glow diffusers staying white)
 * regardless of finish. Deliberately does NOT filter by status: a
 * discontinued or request-only color still shows (greyed-out/dashed,
 * handled by the renderer) rather than silently disappearing -- that's
 * the whole point of the status field existing.
 */
export function availableColorChoices(palette: PaletteColor[], finish: FinishTier, region: ColorRegion): { list: PaletteColor[]; free: boolean } {
  const list = region.allowed ? palette.filter((p) => region.allowed?.includes(p.id)) : palette;
  return { list, free: finish.colors === "any" && !region.allowed };
}

export function isRegionLocked(finishId: string, region: ColorRegion): boolean {
  return (finishId === "separate" || finishId === "finished") && !region.separable && Boolean(region.parent);
}
