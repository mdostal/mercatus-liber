import type { ContrastRule, ExcessUnitRule, PriceBuild, PriceLine, PriceResult, PricingRules } from "./types.js";

/** Distinct palette color ids (or raw hexes) actually used across `build.colors` -- shared by the colorMarkupCents block and the "colorChanges" ExcessUnitRule source so it's computed once per resolvePrice call. */
function distinctColorIds(build: PriceBuild): Set<string> {
  return new Set(Object.values(build.colors ?? {}));
}

/**
 * Every attribute count a build actually carries, after folding in
 * `rules.contrastRules` and `rules.excessUnitRules` -- the only counting
 * this package does itself. Each contrast rule that fires (any of its
 * `regions` has a color that doesn't match any of its `core`'s colors,
 * compared case-insensitively) contributes exactly 1 unit to its own
 * `attributeId`; each excess-unit rule contributes its own derived count
 * (see resolveExcessUnitCount) to its own `attributeId`. Both are added
 * on top of whatever `build.attributeCounts` the caller already supplied
 * for that same id (so a product can mix caller-supplied counts,
 * contrast-rule counts, and excess-unit counts under the same attribute
 * id without any of them silently winning).
 */
function resolveAttributeCounts(rules: PricingRules, build: PriceBuild): Record<string, number> {
  const counts: Record<string, number> = { ...build.attributeCounts };
  const colors = build.colors ?? {};
  for (const rule of rules.contrastRules ?? []) {
    if (contrastFires(rule, colors)) counts[rule.attributeId] = (counts[rule.attributeId] ?? 0) + 1;
  }
  for (const rule of rules.excessUnitRules ?? []) {
    const count = resolveExcessUnitCount(rules, build, rule);
    if (count) counts[rule.attributeId] = (counts[rule.attributeId] ?? 0) + count;
  }
  return counts;
}

function contrastFires(rule: ContrastRule, colors: Record<string, string>): boolean {
  const coreColors = new Set(rule.core.map((regionId) => (colors[regionId] ?? "").toLowerCase()));
  return rule.regions.some((regionId) => colors[regionId] && !coreColors.has(colors[regionId]!.toLowerCase()));
}

/** The raw, un-thresholded value of an ExcessUnitRule's named source for this build -- see ExcessUnitRule's own doc comment for exactly what each source means and where it comes from. */
function sourceValue(rules: PricingRules, build: PriceBuild, source: ExcessUnitRule["source"]): number {
  switch (source) {
    case "estimatedMinutes":
      return rules.estimatedMinutes?.[build.finish] ?? 0;
    case "colorChanges":
      return Math.max(0, distinctColorIds(build).size - 1);
    case "nameLength":
      return build.nameLength ?? 0;
  }
}

/** `round(max(0, sourceValue - freeUnits) * (unitsPerExcess ?? 1))` -- see ExcessUnitRule's own doc comment. Rounded (never truncated) so a product billing by estimated minutes doesn't systematically undercharge, and so every resulting PriceLine.amount stays a whole-cent integer like every other line. */
function resolveExcessUnitCount(rules: PricingRules, build: PriceBuild, rule: ExcessUnitRule): number {
  const excess = Math.max(0, sourceValue(rules, build, rule.source) - rule.freeUnits);
  return Math.round(excess * (rule.unitsPerExcess ?? 1));
}

/**
 * The price of one build, from a product's own PricingRules -- the ONE
 * pricing path every consumer (this package, the shop's own storefront)
 * must call, so a preview price and the real charge never drift apart.
 * Nothing about the formula is fixed: every line beyond "base" comes from
 * `rules.attributes`/`rules.contrastRules`/`rules.excessUnitRules`/
 * `rules.colorMarkupCents`, all admin-defined. Direct correction from the
 * shop owner, replacing an earlier fixed-field design (base + finishDeltas
 * + contrast + artDeltas + a few hardcoded global rates): "it isn't a flat
 * per color count charge... fully customizeable across the entire board."
 *
 * Steps:
 * 1. "base": `rules.basePriceCents[build.finish]` (0 if missing -- a
 *    product that hasn't priced a finish yet prices it at $0, which is
 *    visibly wrong rather than silently defaulted to some other finish's
 *    price).
 * 2. Resolve every attribute's unit count (resolveAttributeCounts above,
 *    which folds in both `rules.contrastRules` and `rules.excessUnitRules`
 *    -- the latter deriving a count from real build-time signals like
 *    estimated print minutes, color changes beyond the first, or
 *    personalization length, rather than a flat caller-supplied number),
 *    then one line per attribute whose count is non-zero AND whose id
 *    the product's own `rules.attributes` actually lists (an attribute
 *    count for an id this product doesn't price contributes nothing --
 *    "fully customizable across the board" means per-product, not every
 *    attribute applies to every product). A `quoteOnly` attribute with a
 *    non-zero count sets `quoteRequired` instead of adding a price line.
 * 3. "color:<id>": `rules.colorMarkupCents[colorId]` for every distinct
 *    `build.colors` value that matches a key in `colorMarkupCents` --
 *    once per distinct color actually used, not once per region.
 * A line with a zero amount is omitted entirely; any other amount,
 * including negative (a discount attribute), is included. `total` is
 * floored at `base` -- the same real-world rule the original cost model
 * used (never let a discount make the whole item cheaper than its own
 * starting price), ported as a deliberate choice, not an accident.
 *
 * `build.colors` MUST be each region's EFFECTIVE color, not the
 * shopper's raw selection -- see PriceBuild.colors' own doc comment.
 * Passing raw picks can misfire a contrastRule for a region that's
 * locked (follows a parent, or the whole piece shares one color) under
 * the current finish: its raw value can differ from a sibling's even
 * though both actually resolve to the same color, which this function
 * has no way to detect on its own (caught in a real integration).
 */
export function resolvePrice(rules: PricingRules, build: PriceBuild): PriceResult {
  const base = rules.basePriceCents[build.finish] ?? 0;
  const lines: PriceLine[] = [{ id: "base", label: "Base price", amount: base }];
  const add = (id: string, label: string, amount: number): void => {
    if (amount) lines.push({ id, label, amount });
  };

  let quoteRequired = false;
  const counts = resolveAttributeCounts(rules, build);
  for (const attribute of rules.attributes) {
    const count = counts[attribute.id] ?? 0;
    if (!count) continue;
    if (attribute.quoteOnly) {
      quoteRequired = true;
      continue;
    }
    add(attribute.id, attribute.label, count * attribute.perUnitCents);
  }

  if (rules.colorMarkupCents) {
    const usedColorIds = distinctColorIds(build);
    for (const colorId of usedColorIds) {
      const markup = rules.colorMarkupCents[colorId];
      if (markup) add(`color:${colorId}`, `Color: ${colorId}`, markup);
    }
  }

  const sum = lines.reduce((total, line) => total + line.amount, 0);
  return { lines, total: Math.max(sum, base), quoteRequired };
}
