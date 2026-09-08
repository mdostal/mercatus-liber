import type { AttributeValue, IdentifyingAttribute } from "@mercatus-liber/core";

/** Stable, order-independent key for a set of identifying attributes -- used to compare two selections for equality regardless of array order. */
export function attributesKey(attrs: IdentifyingAttribute[]): string {
  return [...attrs]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => `${a.key}=${JSON.stringify(a.value)}`)
    .join("&");
}

/**
 * Cartesian product of identifying-attribute value sets, e.g.
 * { color: ["red","blue"], size: ["large"] } -> two combinations:
 * [{key:"color",value:"red"},{key:"size",value:"large"}],
 * [{key:"color",value:"blue"},{key:"size",value:"large"}]
 *
 * `exclude` is a list of combination keys (via attributesKey) to skip -- for
 * product variants that don't actually exist (e.g. an out-of-production color/
 * size pairing). See docs/subsystems/01-catalog.md open question 2 -- no
 * combinatorial cap in v1, documented as an intentional deferral.
 */
export function cartesianProduct(
  valuesByKey: Record<string, AttributeValue[]>,
  exclude: IdentifyingAttribute[][] = [],
): IdentifyingAttribute[][] {
  const keys = Object.keys(valuesByKey);
  if (keys.length === 0) return [];

  const excludedKeys = new Set(exclude.map(attributesKey));

  let combinations: IdentifyingAttribute[][] = [[]];
  for (const key of keys) {
    const values = valuesByKey[key] ?? [];
    const next: IdentifyingAttribute[][] = [];
    for (const combo of combinations) {
      for (const value of values) {
        next.push([...combo, { key, value }]);
      }
    }
    combinations = next;
  }

  return combinations.filter((combo) => !excludedKeys.has(attributesKey(combo)));
}
