"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

export interface MatrixOptionValue {
  id: string;
  label: string;
  /** A short tag after the label, such as "drop" or "internal". */
  badge?: string;
  /** A colour dot before the label. */
  swatch?: string;
  /** Shown under the chips while this value is chosen. */
  description?: ReactNode;
  /** Shown but can't be chosen. */
  disabled?: boolean;
}

/** The current choice per option key. */
export type MatrixSelection = Record<string, string>;

export interface MatrixOption {
  key: string;
  label: string;
  /**
   * The values to offer. A function makes the option depend on earlier ones:
   * it gets the choices made so far, for options listed before this one.
   * An option with no values is hidden and left out of the selection.
   */
  values: MatrixOptionValue[] | ((selection: MatrixSelection) => MatrixOptionValue[]);
  /** Hide the chips when there is only one value; it is still chosen. */
  hideWhenSingle?: boolean;
}

export interface MatrixImage {
  url: string;
  alt: string;
  caption?: string;
  /** Behind the image, such as the garment colour under flat artwork. */
  background?: string;
}

export type MatrixAddResult = void | { ok: true } | { ok: false; error: string };

export interface OptionMatrixConfiguratorProps {
  options: MatrixOption[];
  /** Starting choices; anything missing or unavailable falls back to the first value that can be chosen. */
  initial?: MatrixSelection;
  /** Images for the current choices. The first is large; any others show as a row of thumbnails. */
  images?: (selection: MatrixSelection) => MatrixImage[];
  /** Anything else to show beside the images for the current choices, such as a PrintCoverage drawing. */
  aside?: (selection: MatrixSelection) => ReactNode;
  /** Adds the current choices to the cart. Return `{ ok: false, error }` or throw to show an error. */
  onAdd: (selection: MatrixSelection, quantity: number) => Promise<MatrixAddResult> | MatrixAddResult;
  addLabel?: string;
  /** Default 10. */
  maxQuantity?: number;
  /** Called whenever the choices change. */
  onChange?: (selection: MatrixSelection) => void;
}

/**
 * Settles a selection against the options: each option in order keeps its
 * current value if it is still offered and can be chosen, otherwise takes the
 * first value that can be. Options with no values are dropped.
 */
export function resolveMatrixSelection(options: MatrixOption[], wanted: MatrixSelection): { selection: MatrixSelection; offered: Record<string, MatrixOptionValue[]> } {
  const selection: MatrixSelection = {};
  const offered: Record<string, MatrixOptionValue[]> = {};
  for (const option of options) {
    const values = typeof option.values === "function" ? option.values({ ...selection }) : option.values;
    offered[option.key] = values;
    const keep = values.find((v) => v.id === wanted[option.key] && !v.disabled);
    const chosen = keep ?? values.find((v) => !v.disabled);
    if (chosen) selection[option.key] = chosen.id;
  }
  return { selection, offered };
}

const groupLabel = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-muted, #555)",
  margin: "0 0 6px",
} as const;

function chipStyle(on: boolean, disabled: boolean) {
  return {
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 10px",
    borderRadius: 6,
    border: `1.5px solid ${on ? "var(--color-text, #111)" : "var(--color-border, #ccc)"}`,
    background: on ? "var(--color-text, #111)" : "var(--color-surface, #fff)",
    color: on ? "var(--color-background, #fff)" : "var(--color-text, #111)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  } as const;
}

const imageStyle = (background?: string) =>
  ({ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8, background: background ?? "var(--color-surface, #fff)", border: "1px solid var(--color-border, #ccc)" }) as const;

/**
 * Pick a value for each option as chips, see images of exactly that
 * combination, and add it to the cart. Options can depend on earlier ones:
 * when a choice removes a later option's value, the later option moves to
 * its first available value.
 */
export function OptionMatrixConfigurator({ options, initial = {}, images, aside, onAdd, addLabel = "Add to cart", maxQuantity = 10, onChange }: OptionMatrixConfiguratorProps) {
  const [wanted, setWanted] = useState<MatrixSelection>(initial);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const quantityId = useId();
  const { selection, offered } = resolveMatrixSelection(options, wanted);
  const pics = images?.(selection) ?? [];
  const extra = aside?.(selection);

  const choose = (key: string, id: string) => {
    const next = resolveMatrixSelection(options, { ...selection, [key]: id }).selection;
    setWanted(next);
    setMessage(null);
    onChange?.(next);
  };
  const add = () =>
    startTransition(async () => {
      try {
        const result = await onAdd(selection, quantity);
        setMessage(result && result.ok === false ? { error: true, text: result.error } : { error: false, text: "Added to cart." });
      } catch (err) {
        setMessage({ error: true, text: err instanceof Error ? err.message : String(err) });
      }
    });

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
      {(pics.length > 0 || extra) && (
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          {pics[0] && (
            <figure style={{ margin: 0 }} data-image="main">
              <img src={pics[0].url} alt={pics[0].alt} style={imageStyle(pics[0].background)} />
              {pics[0].caption && <figcaption style={{ fontSize: 12, color: "var(--color-text-muted, #555)", marginTop: 4 }}>{pics[0].caption}</figcaption>}
            </figure>
          )}
          {pics.length > 1 && (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {pics.slice(1).map((p) => (
                <figure key={p.url} style={{ margin: 0 }} data-image="thumb">
                  <img src={p.url} alt={p.alt} loading="lazy" style={imageStyle(p.background)} />
                  {p.caption && <figcaption style={{ fontSize: 12, color: "var(--color-text-muted, #555)" }}>{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {extra}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) add();
        }}
        style={{ display: "grid", gap: 14, minWidth: 0 }}
      >
        {options.map((option) => {
          const values = offered[option.key] ?? [];
          if (values.length === 0) return null;
          const chosen = values.find((v) => v.id === selection[option.key]);
          if (option.hideWhenSingle && values.length === 1) return null;
          return (
            <div key={option.key} role="group" aria-label={option.label} data-option={option.key}>
              <p style={groupLabel}>{option.label}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {values.map((v) => {
                  const on = v.id === selection[option.key];
                  return (
                    <button key={v.id} type="button" aria-pressed={on} disabled={v.disabled} data-value={v.id} onClick={() => choose(option.key, v.id)} style={chipStyle(on, !!v.disabled)}>
                      {v.swatch && (
                        <span aria-hidden style={{ display: "inline-block", width: 11, height: 11, borderRadius: "50%", background: v.swatch, border: "1px solid var(--color-border, #ccc)", marginRight: 6, verticalAlign: -1 }} />
                      )}
                      {v.label}
                      {v.badge && <span style={{ fontWeight: 500, opacity: 0.7 }}> · {v.badge}</span>}
                    </button>
                  );
                })}
              </div>
              {chosen?.description && <div style={{ fontSize: 13, color: "var(--color-text-muted, #555)", margin: "6px 0 0" }}>{chosen.description}</div>}
            </div>
          );
        })}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 14 }} htmlFor={quantityId}>
            Qty{" "}
          </label>
          <input
            id={quantityId}
            type="number"
            min={1}
            max={maxQuantity}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
            style={{ width: 60, font: "inherit", padding: "6px 8px", border: "1.5px solid var(--color-border, #ccc)", borderRadius: 6 }}
          />
          <button
            type="submit"
            disabled={pending}
            style={{ font: "inherit", fontWeight: 700, padding: "10px 18px", borderRadius: 6, border: "2px solid var(--color-text, #111)", background: "var(--color-primary, #333)", color: "var(--color-on-primary, #fff)", cursor: "pointer" }}
          >
            {pending ? "Adding…" : addLabel}
          </button>
        </div>
        {message && (
          <p role={message.error ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: message.error ? "var(--color-danger, #b42318)" : "var(--color-text-muted, #555)" }}>
            {message.text}
          </p>
        )}
      </form>
    </div>
  );
}
