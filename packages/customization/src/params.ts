import type { LineParamValue } from "@mercatus-liber/core";

/**
 * Buyer measurements and settings for a product built to the buyer's own
 * numbers (a "measured" product, such as a clip sized to their bed rails).
 * Mirrors `customize.params` in the print tools' color-regions.json; see
 * measuredFromPrintTools to convert that file's entries.
 */
export type MeasuredParamKind = "number" | "choice" | "choice_list" | "number_list" | "lines";

export interface MeasuredParamChoice {
  id: string;
  label?: string;
}

export interface MeasuredParam {
  id: string;
  label: string;
  kind: MeasuredParamKind;
  /** e.g. "mm". */
  unit?: string;
  /** Range of a number, or of each number in a number_list. */
  min?: number;
  max?: number;
  step?: number;
  /** For choice and choice_list. An empty id is a valid choice (a gap). */
  choices?: MeasuredParamChoice[];
  /** Most entries in a choice_list, number_list or lines. */
  maxItems?: number;
  default: LineParamValue;
  /** How to measure it, for the shopper. */
  help?: string;
  /** A heading to group it under, e.g. "Your bed". */
  group?: string;
  /** Shown and used only when each named param (or "finish") has one of these values. */
  when?: Record<string, string[]>;
}

/** Named sets of values, e.g. the owner's own bed. */
export interface MeasuredPreset {
  id: string;
  label: string;
  note?: string;
  values: Record<string, LineParamValue>;
}

export interface MeasuredCustomization {
  params: MeasuredParam[];
  presets?: MeasuredPreset[];
  /** The preset whose values stand in for params the shopper leaves out, before each param's own default. */
  defaultPreset?: string;
}

/** The largest params object a line may carry, as JSON. The print tools' worst case is about 2 KB. */
export const MAX_PARAMS_BYTES = 4096;

export class InvalidParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParamsError";
  }
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The value each param takes when the shopper leaves it out: the default preset's, else its own default. */
export function measuredDefaults(measured: MeasuredCustomization): Record<string, LineParamValue> {
  const preset = measured.presets?.find((p) => p.id === measured.defaultPreset);
  const values: Record<string, LineParamValue> = {};
  for (const param of measured.params) values[param.id] = preset && param.id in preset.values ? preset.values[param.id]! : param.default;
  return values;
}

/** Whether a param applies, given every param's effective value and the finish. */
export function isParamActive(param: MeasuredParam, effective: Record<string, LineParamValue>, finish: string): boolean {
  if (!param.when) return true;
  return Object.entries(param.when).every(([key, allowed]) => {
    const value = key === "finish" ? finish : effective[key];
    return typeof value === "string" && allowed.includes(value);
  });
}

function range(param: MeasuredParam): string {
  return `${param.min ?? "-∞"} to ${param.max ?? "∞"}${param.unit ? ` ${param.unit}` : ""}`;
}

function checkNumber(param: MeasuredParam, value: unknown, where: string): void {
  if (!isNumber(value)) throw new InvalidParamsError(`${where} must be a number`);
  if ((param.min !== undefined && value < param.min) || (param.max !== undefined && value > param.max)) {
    throw new InvalidParamsError(`${where} ${value} is outside ${range(param)}`);
  }
}

function checkCount(param: MeasuredParam, value: unknown[]): void {
  if (param.maxItems !== undefined && value.length > param.maxItems) throw new InvalidParamsError(`${param.id} has ${value.length} entries; at most ${param.maxItems}`);
}

/** Checks one value against its param's kind and limits. Throws InvalidParamsError naming the param. */
export function validateParamValue(param: MeasuredParam, value: unknown): void {
  const choiceIds = () => (param.choices ?? []).map((c) => c.id);
  switch (param.kind) {
    case "number":
      return checkNumber(param, value, param.id);
    case "choice":
      if (typeof value !== "string" || !choiceIds().includes(value)) throw new InvalidParamsError(`${param.id} must be one of ${choiceIds().map((c) => `"${c}"`).join(", ")}`);
      return;
    case "choice_list": {
      if (!Array.isArray(value)) throw new InvalidParamsError(`${param.id} must be a list`);
      checkCount(param, value);
      value.forEach((v, i) => {
        if (typeof v !== "string" || !choiceIds().includes(v)) throw new InvalidParamsError(`${param.id}[${i}] must be one of ${choiceIds().map((c) => `"${c}"`).join(", ")}`);
      });
      return;
    }
    case "number_list": {
      if (!Array.isArray(value)) throw new InvalidParamsError(`${param.id} must be a list of numbers`);
      checkCount(param, value);
      value.forEach((v, i) => checkNumber(param, v, `${param.id}[${i}]`));
      return;
    }
    case "lines": {
      if (!Array.isArray(value)) throw new InvalidParamsError(`${param.id} must be a list of lines`);
      checkCount(param, value);
      value.forEach((line, i) => {
        if (!Array.isArray(line) || line.length !== 4 || !line.every(isNumber)) throw new InvalidParamsError(`${param.id}[${i}] must be [x1, y1, x2, y2] in numbers`);
      });
      return;
    }
    default:
      throw new InvalidParamsError(`${(param as MeasuredParam).id} has an unknown kind`);
  }
}

/**
 * Validates what the shopper sent for a measured product and returns the
 * params a line should carry: as sent, minus any that don't apply under the
 * other values and the finish (like picks that don't apply). Left-out params
 * take the default preset's or their own default, at the print tools.
 * Refuses an unknown param, a value of the wrong kind or out of range, and
 * an oversized object. The print tools still refuse what the model can't
 * build.
 */
export function resolveParams(measured: MeasuredCustomization, sent: Record<string, unknown>, finish: string): Record<string, LineParamValue> {
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) throw new InvalidParamsError("params must be an object");
  if (JSON.stringify(sent).length > MAX_PARAMS_BYTES) throw new InvalidParamsError(`params is larger than ${MAX_PARAMS_BYTES} bytes`);
  const byId = new Map(measured.params.map((p) => [p.id, p]));
  for (const key of Object.keys(sent)) if (!byId.has(key)) throw new InvalidParamsError(`Unknown param "${key}"`);
  for (const [key, value] of Object.entries(sent)) validateParamValue(byId.get(key)!, value);
  const effective = { ...measuredDefaults(measured), ...(sent as Record<string, LineParamValue>) };
  const result: Record<string, LineParamValue> = {};
  for (const [key, value] of Object.entries(sent)) if (isParamActive(byId.get(key)!, effective, finish)) result[key] = value as LineParamValue;
  return result;
}

/** Checks a product's measured configuration: unique ids, known kinds, choices where needed, valid defaults and presets. */
export function validateMeasured(measured: MeasuredCustomization): void {
  const ids = new Set<string>();
  for (const param of measured.params) {
    if (ids.has(param.id)) throw new InvalidParamsError(`Duplicate param "${param.id}"`);
    ids.add(param.id);
    if ((param.kind === "choice" || param.kind === "choice_list") && !param.choices?.length) throw new InvalidParamsError(`${param.id} needs choices`);
    validateParamValue(param, param.default);
  }
  for (const param of measured.params) {
    for (const key of Object.keys(param.when ?? {})) if (key !== "finish" && !ids.has(key)) throw new InvalidParamsError(`${param.id} depends on unknown param "${key}"`);
  }
  for (const preset of measured.presets ?? []) {
    for (const [key, value] of Object.entries(preset.values)) {
      const param = measured.params.find((p) => p.id === key);
      if (!param) throw new InvalidParamsError(`Preset "${preset.id}" sets unknown param "${key}"`);
      validateParamValue(param, value);
    }
  }
  if (measured.defaultPreset && !measured.presets?.some((p) => p.id === measured.defaultPreset)) throw new InvalidParamsError(`Unknown default preset "${measured.defaultPreset}"`);
}

/**
 * Converts a product's `customize` block from the print tools'
 * color-regions.json (`params`, `presets`, `default_preset`; snake_case,
 * choices as ids or `{id, label}`) into a MeasuredCustomization.
 */
export function measuredFromPrintTools(customize: {
  params: Array<Record<string, unknown>>;
  presets?: Array<{ id: string; label: string; note?: string; values: Record<string, LineParamValue> }>;
  default_preset?: string;
}): MeasuredCustomization {
  const params = customize.params.map((raw): MeasuredParam => {
    const { max_items, choices, ...rest } = raw as Record<string, unknown> & { max_items?: number; choices?: Array<string | MeasuredParamChoice> };
    return {
      ...(rest as Omit<MeasuredParam, "choices" | "maxItems">),
      ...(choices ? { choices: choices.map((c) => (typeof c === "string" ? { id: c } : c)) } : {}),
      ...(max_items !== undefined ? { maxItems: max_items } : {}),
    };
  });
  return {
    params,
    ...(customize.presets ? { presets: customize.presets.map((p) => ({ id: p.id, label: p.label, ...(p.note ? { note: p.note } : {}), values: p.values })) } : {}),
    ...(customize.default_preset ? { defaultPreset: customize.default_preset } : {}),
  };
}
