import type { ColorRegion, OptionChoice, PickCondition, ProductCustomization, ProductOption, ResolvedPicks } from "./types.js";

/** Thrown when a product's picks can't produce a buildable version of it. The message names the pick at fault. */
export class InvalidPicksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPicksError";
  }
}

/** Thrown when a product's options, variants, or region conditions name something that doesn't exist -- a data problem, not shopper input. */
export class InvalidOptionsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOptionsConfigError";
  }
}

function matches(condition: PickCondition | undefined, picks: Record<string, string>): boolean {
  return Object.entries(condition ?? {}).every(([key, allowed]) => {
    const pick = Object.hasOwn(picks, key) ? picks[key] : undefined;
    return pick !== undefined && (Array.isArray(allowed) ? allowed : [allowed]).includes(pick);
  });
}

/** Drops picks for unknown options and for options whose `when` isn't met, repeating until stable, because dropping one pick can hide another option. */
function livePicks(options: ProductOption[], picks: Record<string, string>): Record<string, string> {
  const byId = new Map(options.map((option) => [option.id, option]));
  const live: Record<string, string> = {};
  for (const [key, value] of Object.entries(picks)) if (byId.has(key)) live[key] = value;
  for (let changed = true; changed; ) {
    changed = false;
    for (const key of Object.keys(live)) {
      if (!matches(byId.get(key)!.when, live)) {
        delete live[key];
        changed = true;
      }
    }
  }
  return live;
}

/**
 * Turns a shopper's raw picks into what the product actually is:
 * 1. Drops picks that don't apply, such as a lock style when the shopper chose no lock.
 * 2. Refuses an unknown or discontinued choice, or a choice whose `only` isn't met.
 * 3. Finds the variant: the first row whose `when` matches. Refuses if none does.
 * `request`-status choices are allowed through and listed in `requests`, so the
 * caller can capture them with the order. `attributeCounts` holds one unit per
 * live choice that names an `attributeId`; pass it to PriceBuild.attributeCounts.
 */
export function resolvePicks(customization: Pick<ProductCustomization, "options" | "variants">, picks: Record<string, string> = {}): ResolvedPicks {
  const options = customization.options ?? [];
  const live = livePicks(options, picks);
  const requests: ResolvedPicks["requests"] = [];
  const attributeCounts: Record<string, number> = {};

  for (const option of options) {
    if (!Object.hasOwn(live, option.id)) continue;
    const value = live[option.id]!;
    const choice: OptionChoice | undefined = option.choices.find((c) => c.id === value);
    if (!choice) throw new InvalidPicksError(`Unknown choice "${value}" for option "${option.id}"`);
    if (choice.status === "discontinued") throw new InvalidPicksError(`Choice "${value}" for option "${option.id}" is discontinued`);
    if (choice.only && !matches(choice.only, live)) throw new InvalidPicksError(`Choice "${value}" for option "${option.id}" needs ${JSON.stringify(choice.only)}`);
    if (choice.status === "request") requests.push({ optionId: option.id, choiceId: value });
    if (choice.attributeId) attributeCounts[choice.attributeId] = (attributeCounts[choice.attributeId] ?? 0) + 1;
  }

  let variantId: string | null = null;
  if (customization.variants) {
    const row = customization.variants.rows.find((r) => matches(r.when, live));
    if (!row) throw new InvalidPicksError(`No version of this product matches ${JSON.stringify(picks)}`);
    variantId = row.id;
  }
  return { picks: live, variantId, requests, attributeCounts };
}

/** The regions this version of the product actually has. A region with `when` exists only for the variant ids it lists. */
export function activeRegions(customization: Pick<ProductCustomization, "regions" | "variants">, variantId: string | null): ColorRegion[] {
  const key = customization.variants?.key;
  return customization.regions.filter((region) => {
    if (!region.when) return true;
    return variantId !== null && key !== undefined && (region.when[key] ?? []).includes(variantId);
  });
}

/** Whether an option applies given the other picks. */
export function isOptionVisible(option: ProductOption, picks: Record<string, string>): boolean {
  return matches(option.when, picks);
}

/** Whether a choice can be picked given the other picks: not discontinued, and its `only` met. */
export function isChoiceAvailable(choice: OptionChoice, picks: Record<string, string>): boolean {
  return choice.status !== "discontinued" && matches(choice.only, picks);
}

/**
 * The closest valid picks to what's given, for a UI to hold while a shopper
 * changes things. Walks options in order, keeps a pick that's still available,
 * and otherwise takes the first active choice, so changing one option can't leave
 * another stuck on something invalid. Request-only choices stay if picked, but are
 * never chosen automatically.
 */
export function normalizePicks(customization: Pick<ProductCustomization, "options">, picks: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const option of customization.options ?? []) {
    if (!matches(option.when, result)) continue;
    const current = Object.hasOwn(picks, option.id) ? option.choices.find((c) => c.id === picks[option.id]) : undefined;
    const choice = current && isChoiceAvailable(current, result) ? current : option.choices.find((c) => (c.status ?? "active") === "active" && matches(c.only, result));
    if (choice) result[option.id] = choice.id;
  }
  return result;
}

/** A starting set of picks: each applicable option's first active choice whose `only` is met. */
export function defaultPicks(customization: Pick<ProductCustomization, "options">): Record<string, string> {
  return normalizePicks(customization, {});
}

/** Checks that a product's conditions only name options, choices' owners, and variants that exist. Called whenever a product customization is saved through the service. */
export function validateOptions(customization: Pick<ProductCustomization, "options" | "variants" | "regions">): void {
  const options = customization.options ?? [];
  const optionIds = new Set(options.map((o) => o.id));
  const requireOptions = (condition: PickCondition | undefined, where: string): void => {
    for (const key of Object.keys(condition ?? {})) {
      if (!optionIds.has(key)) throw new InvalidOptionsConfigError(`${where} names unknown option "${key}"`);
    }
  };
  for (const option of options) {
    requireOptions(option.when, `Option "${option.id}"`);
    for (const choice of option.choices) requireOptions(choice.only, `Choice "${option.id}.${choice.id}"`);
  }
  const variantIds = new Set(customization.variants?.rows.map((r) => r.id));
  for (const row of customization.variants?.rows ?? []) requireOptions(row.when, `Variant "${row.id}"`);
  for (const region of customization.regions) {
    for (const [key, ids] of Object.entries(region.when ?? {})) {
      if (key !== customization.variants?.key) throw new InvalidOptionsConfigError(`Region "${region.id}" has a condition on "${key}", which is not this product's variant key`);
      for (const id of ids) if (!variantIds.has(id)) throw new InvalidOptionsConfigError(`Region "${region.id}" names unknown variant "${id}"`);
    }
  }
}
