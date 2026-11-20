"use client";

import { useEffect, useId, useState, useTransition } from "react";

/** A picture of the product with its print area marked, in the template image's pixels. */
export interface PlacementTemplate {
  imageUrl: string;
  backgroundUrl?: string | null;
  /** Behind everything, usually the product colour. */
  backgroundColor?: string | null;
  templateWidth: number;
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number };
  /** "overlay": the template image has a transparent window and goes on top of the art. Anything else: the art goes on top. */
  positioning?: string;
}

export interface PlacementPreviewProps {
  template: PlacementTemplate;
  /** The print file. Drawn to fill the print area, top-centred, as a provider prints a file made at the print area's size. */
  artUrl?: string;
  /** The print file size the provider wants, to warn about the wrong size or shape. */
  printAreaPx?: { width: number; height: number };
  /** Widest the preview is drawn, in CSS pixels. Default 360. */
  maxWidth?: number;
  label: string;
}

/** What's wrong with art of this pixel size for a print area of that size, or null. Within 2% counts as the same shape. */
export function artFitWarning(art: { width: number; height: number }, area: { width: number; height: number }): string | null {
  const shape = art.width / art.height / (area.width / area.height);
  if (Math.abs(shape - 1) > 0.02) return `The art is ${art.width} × ${art.height} px, a different shape from the ${area.width} × ${area.height} px print area, so it won't fill it.`;
  if (art.width < area.width * 0.98) return `The art is ${art.width} × ${art.height} px, smaller than the ${area.width} × ${area.height} px the print area wants, so it may print soft.`;
  return null;
}

/**
 * The product's template with the art drawn where it will print. No provider
 * call: the template and the art are both images. Shows a warning when the
 * art's size or shape doesn't match the print area.
 */
export function PlacementPreview({ template, artUrl, printAreaPx, maxWidth = 360, label }: PlacementPreviewProps) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => setNatural(null), [artUrl]);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const area = template.printArea;
  const overlay = template.positioning === "overlay";
  const warning = natural && printAreaPx ? artFitWarning(natural, printAreaPx) : null;
  const art = artUrl ? (
    <img
      data-art
      src={artUrl}
      alt=""
      onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      style={{ position: "absolute", left: pct(area.left, template.templateWidth), top: pct(area.top, template.templateHeight), width: pct(area.width, template.templateWidth), height: pct(area.height, template.templateHeight), objectFit: "contain", objectPosition: "top center", zIndex: overlay ? 1 : 2 }}
    />
  ) : null;

  return (
    <figure style={{ margin: 0, display: "grid", gap: 6, maxWidth }}>
      <div
        role="img"
        aria-label={`${label}${artUrl ? " with the art in place" : ", no art yet"}`}
        style={{ position: "relative", width: "100%", aspectRatio: `${template.templateWidth} / ${template.templateHeight}`, background: template.backgroundColor ?? "var(--color-surface, #fff)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border, #ccc)" }}
      >
        {template.backgroundUrl && <img src={template.backgroundUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }} />}
        {art}
        <img data-template src={template.imageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: overlay ? 2 : 1, pointerEvents: "none" }} />
        <span
          data-print-area
          aria-hidden
          style={{ position: "absolute", left: pct(area.left, template.templateWidth), top: pct(area.top, template.templateHeight), width: pct(area.width, template.templateWidth), height: pct(area.height, template.templateHeight), outline: "1.5px dashed var(--color-primary, #333)", zIndex: 3, pointerEvents: "none" }}
        />
      </div>
      <figcaption style={{ fontSize: 12, color: "var(--color-text-muted, #555)" }}>
        {label}
        {printAreaPx ? ` · print file ${printAreaPx.width} × ${printAreaPx.height} px` : ""}
        {natural ? ` · art ${natural.width} × ${natural.height} px` : ""}
      </figcaption>
      {warning && (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--color-danger, #b42318)" }}>
          {warning}
        </p>
      )}
    </figure>
  );
}

export type PlacementArtResult = { ok: true } | { ok: false; error: string };

export interface PlacementArtEditorProps extends Omit<PlacementPreviewProps, "artUrl"> {
  /** The art set now, if any. */
  artUrl?: string;
  onSave: (url: string) => Promise<PlacementArtResult>;
  onRemove?: () => Promise<PlacementArtResult>;
}

/** A placement's preview with a field to set or remove its print file URL. */
export function PlacementArtEditor({ artUrl, onSave, onRemove, ...preview }: PlacementArtEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(artUrl ?? "");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<PlacementArtResult>, done: string) =>
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.ok ? { error: false, text: done } : { error: true, text: result.error });
      } catch (err) {
        setMessage({ error: true, text: err instanceof Error ? err.message : String(err) });
      }
    });

  return (
    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
      <PlacementPreview {...preview} {...(draft.trim() ? { artUrl: draft.trim() } : {})} />
      <label htmlFor={`${id}-url`} style={{ display: "grid", gap: 4, fontSize: 12 }}>
        Print file URL
        <input
          id={`${id}-url`}
          type="url"
          value={draft}
          placeholder="https://…/print-file.png"
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          style={{ font: "inherit", fontSize: 13, padding: "6px 8px", border: "1.5px solid var(--color-border, #ccc)", borderRadius: 6 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={pending || !draft.trim() || draft.trim() === artUrl} onClick={() => run(() => onSave(draft.trim()), "Saved. Every SKU of this product now uses this file here.")}>
          Save art
        </button>
        {onRemove && artUrl && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await onRemove();
                if (result.ok) setDraft("");
                return result;
              }, "Removed.")
            }
          >
            Remove
          </button>
        )}
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} style={{ margin: 0, fontSize: 12, color: message.error ? "var(--color-danger, #b42318)" : "inherit" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
