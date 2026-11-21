"use client";

import { useState, useTransition, type ReactNode } from "react";

/** One editable text field of the art's copy. */
export interface ArtField {
  key: string;
  label: string;
  /** Most characters the layout can hold; Save is disabled while any field is over. */
  max?: number;
  /** Shown under the field. */
  hint?: string;
}

export interface EditorArtVersion<T> {
  version: number;
  note: string;
  copy: T;
  /** A small image of the saved print file, if the store has one. */
  previewUrl?: string;
}

export interface SampleTarget {
  /** Passed back to `onOrderSample`; the store decides what it means (for example "tee|L|large"). */
  value: string;
  label: string;
}

export type EditorActionResult = void | { ok: true } | { ok: false; error: string };

export interface ArtVersionEditorProps<T extends Record<string, unknown>> {
  artId: string;
  fields: ArtField[];
  /** The copy the editor starts from and "Reset to pinned" returns to: normally the pinned version's. */
  base: T;
  /** The version the store sells; marked "on the store". */
  pin: number;
  versions: EditorArtVersion<T>[];
  /** Draws the current copy, live, as the owner types. Leave out for no preview. */
  preview?: (copy: T) => ReactNode;
  /** Saves the copy as the next version. Throw or return `{ ok: false, error }` to show an error. */
  onSave: (copy: T, note: string) => Promise<EditorActionResult> | EditorActionResult;
  /** Orders a sample of one version. Leave out to hide sample ordering. */
  onOrderSample?: (version: number, target: string) => Promise<EditorActionResult> | EditorActionResult;
  sampleTargets?: SampleTarget[];
  /** Button text for ordering a sample. Default "Order sample". */
  sampleLabel?: string;
  /**
   * Painted behind each version's print-file image. Print files are usually
   * transparent, so light art on a light card looks faded without one; pass
   * the garment colour, such as "#141414" for black shirts.
   */
  previewBackground?: string;
  /** What to tell the owner about putting an unpinned version on sale (it is a code change). */
  pinHelp?: (version: number) => ReactNode;
  /** Controlled copy, for filling the fields from outside (a RatingsTable's "Use this"). Pair with `onCopyChange`. */
  copy?: T;
  onCopyChange?: (copy: T) => void;
}

const inputStyle = {
  fontFamily: "inherit",
  fontSize: 14,
  padding: "7px 9px",
  borderWidth: "1.5px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)",
  borderRadius: 6,
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-background, #fff)",
  color: "var(--color-text, #111)",
} as const;

function buttonStyle(primary: boolean, small = false) {
  return {
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: small ? 12 : 14,
    padding: small ? "4px 8px" : "8px 14px",
    borderRadius: 6,
    borderWidth: "2px", borderStyle: "solid", borderColor: "var(--color-text, #111)",
    background: primary ? "var(--color-primary, #333)" : "var(--color-surface, #fff)",
    color: primary ? "var(--color-on-primary, #fff)" : "var(--color-text, #111)",
    cursor: "pointer",
  } as const;
}

const muted = { fontSize: 13, color: "var(--color-text-muted, #555)" } as const;

async function run(action: () => Promise<EditorActionResult> | EditorActionResult): Promise<string | null> {
  try {
    const result = await action();
    return result && result.ok === false ? result.error : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Edits a piece of print art as text fields with a live preview, saves the
 * result as a new immutable version, and lists every version with its note,
 * which one is on the store, and a way to order a sample of it.
 *
 * Saving never changes what the store sells: that stays a reviewed change to
 * the store's pins (see `@mercatus-liber/print-art`).
 */
export function ArtVersionEditor<T extends Record<string, unknown>>(props: ArtVersionEditorProps<T>) {
  const { artId, fields, base, pin, versions } = props;
  const [ownCopy, setOwnCopy] = useState<T>(base);
  const copy = props.copy ?? ownCopy;
  const setCopy = (next: T) => {
    if (props.copy === undefined) setOwnCopy(next);
    props.onCopyChange?.(next);
  };
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const text = (key: string) => (typeof copy[key] === "string" ? (copy[key] as string) : "");
  const over = fields.filter((f) => f.max !== undefined && text(f.key).length > f.max);
  const nextVersion = Math.max(0, ...versions.map((v) => v.version)) + 1;

  const save = () =>
    startTransition(async () => {
      const error = await run(() => props.onSave(copy, note.trim()));
      setMessage(error ? { error: true, text: error } : { error: false, text: `Saved as version ${nextVersion}.` });
      if (!error) setNote("");
    });

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
        {props.preview && <div style={{ flex: "0 0 auto", maxWidth: "100%" }}>{props.preview(copy)}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (over.length === 0 && !pending) save();
          }}
          style={{ display: "grid", gap: 10, flex: "1 1 320px", minWidth: 0 }}
        >
          {fields.map((f) => {
            const length = text(f.key).length;
            const tooLong = f.max !== undefined && length > f.max;
            const id = `${artId}-${f.key}`;
            return (
              <div key={f.key} style={{ display: "grid", gap: 4 }}>
                <label htmlFor={id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 600 }}>
                  <span>{f.label}</span>
                  {f.max !== undefined && (
                    <span data-count={f.key} style={{ fontWeight: 400, fontVariantNumeric: "tabular-nums", color: tooLong ? "var(--color-danger, #b42318)" : "var(--color-text-muted, #555)" }}>
                      {length}/{f.max}
                    </span>
                  )}
                </label>
                <input
                  id={id}
                  name={f.key}
                  value={text(f.key)}
                  aria-invalid={tooLong || undefined}
                  onChange={(e) => setCopy({ ...copy, [f.key]: e.target.value })}
                  style={{ ...inputStyle, ...(tooLong ? { borderColor: "var(--color-danger, #b42318)" } : {}) }}
                />
                {f.hint && <span style={muted}>{f.hint}</span>}
              </div>
            );
          })}
          <div style={{ display: "grid", gap: 4 }}>
            <label htmlFor={`${artId}-note`} style={{ fontSize: 13, fontWeight: 600 }}>
              Note (why this version)
            </label>
            <input id={`${artId}-note`} name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. panel pick, shorter close" style={inputStyle} />
          </div>
          {over.length > 0 && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--color-danger, #b42318)" }}>
              Too long to print: {over.map((f) => f.label).join(", ")}.
            </p>
          )}
          {message && (
            <p role={message.error ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: message.error ? "var(--color-danger, #b42318)" : "var(--color-text-muted, #555)" }}>
              {message.text}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="submit" disabled={over.length > 0 || pending} style={buttonStyle(true)}>
              {pending ? "Saving…" : `Save as version ${nextVersion}`}
            </button>
            <button type="button" onClick={() => setCopy(base)} style={buttonStyle(false)}>
              Reset to pinned
            </button>
          </div>
        </form>
      </div>

      <section>
        <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>Versions</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
          {versions.map((v) => (
            <VersionCard key={v.version} {...props} version={v} pinned={v.version === pin} onEdit={() => setCopy(v.copy)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function VersionCard<T extends Record<string, unknown>>({
  artId,
  version: v,
  pinned,
  onEdit,
  onOrderSample,
  sampleTargets = [],
  sampleLabel = "Order sample",
  pinHelp,
  previewBackground,
}: ArtVersionEditorProps<T> & { version: EditorArtVersion<T>; pinned: boolean; onEdit: () => void }) {
  const [target, setTarget] = useState(sampleTargets[0]?.value ?? "");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const order = () =>
    startTransition(async () => {
      const error = await run(() => onOrderSample!(v.version, target));
      setMessage(error ? { error: true, text: error } : { error: false, text: "Sample ordered." });
    });
  return (
    <div
      data-version={v.version}
      style={{ display: "grid", gridTemplateColumns: v.previewUrl ? "96px 1fr" : "1fr", gap: 12, padding: 12, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 8, background: "var(--color-surface, #fff)", alignItems: "start" }}
    >
      {v.previewUrl && <img src={v.previewUrl} alt={`Version ${v.version} print file`} loading="lazy" style={{ width: 96, maxWidth: "100%", borderRadius: 6, ...(previewBackground ? { background: previewBackground } : {}) }} />}
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <strong>
          v{v.version}
          {pinned && <span data-pinned style={{ fontSize: 12, padding: "2px 6px", borderRadius: 99, border: "1px solid currentColor", marginLeft: 6 }}>on the store</span>}
        </strong>
        {v.note && <span style={muted}>{v.note}</span>}
        <button type="button" onClick={onEdit} style={{ ...buttonStyle(false, true), justifySelf: "start" }}>
          Edit from this
        </button>
        {onOrderSample && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}>
            {sampleTargets.length > 1 && (
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                aria-label={`What to sample version ${v.version} on`}
                id={`${artId}-v${v.version}-target`}
                style={{ ...inputStyle, width: "auto", minWidth: 0, maxWidth: "100%", flex: "1 1 150px", fontSize: 12, padding: "4px 6px" }}
              >
                {sampleTargets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            <button type="button" disabled={pending} onClick={order} style={buttonStyle(true, true)}>
              {pending ? "Ordering…" : sampleLabel}
            </button>
          </div>
        )}
        {message && (
          <span role={message.error ? "alert" : "status"} style={{ fontSize: 12, color: message.error ? "var(--color-danger, #b42318)" : "var(--color-text-muted, #555)" }}>
            {message.text}
          </span>
        )}
        {!pinned && pinHelp && (
          <details style={{ fontSize: 12 }}>
            <summary>Put on the store</summary>
            <div style={{ margin: "6px 0" }}>{pinHelp(v.version)}</div>
          </details>
        )}
      </div>
    </div>
  );
}
