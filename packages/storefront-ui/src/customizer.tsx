"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  activeRegions,
  availableColorChoices,
  defaultSelection,
  isChoiceAvailable,
  isOptionVisible,
  normalizePicks,
  resolvePicks,
  validateSelectedColor,
  type ArtStyle,
  type CustomizationSelection,
  type FinishTier,
  type LineInput,
  type PaletteColor,
  type PriceLine,
  type ProductCustomization,
  type RegionColorChoices,
} from "@mercatus-liber/customization/client";
import { PriceBreakdown } from "./price-breakdown.js";

export type QuoteResult = { ok: true; lines: PriceLine[]; total: number; quoteRequired: boolean } | { ok: false; error: string };
export type AddToCartResult = { ok: true } | { ok: false; error: string };

export interface CustomizerProps {
  palette: PaletteColor[];
  finishes: FinishTier[];
  artStyles?: ArtStyle[];
  customization: ProductCustomization;
  currency: string;
  /** Prices the current choices on the server. Called as the shopper changes things. */
  quote: (input: LineInput) => Promise<QuoteResult>;
  /** Validates, prices, and adds the choices on the server. */
  addToCart: (input: LineInput, quantity: number) => Promise<AddToCartResult>;
  /** Set to offer personalization text, such as "Name to embroider". */
  nameLabel?: string;
  cartHref?: string;
}

const groupStyle = { border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-xs, 0.5rem)" } as const;
const legendStyle = { padding: 0, fontWeight: 600 } as const;
const rowStyle = { display: "flex", flexWrap: "wrap", gap: "var(--space-xs, 0.5rem)" } as const;

function choiceStyle(selected: boolean) {
  return {
    padding: "0.4rem 0.75rem",
    borderRadius: "var(--radius, 4px)",
    border: `2px solid ${selected ? "var(--color-primary, #333)" : "var(--color-border, #ccc)"}`,
    background: "transparent",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  } as const;
}

function statusText(status: string | undefined): string {
  return status === "discontinued" ? " (no longer offered)" : status === "request" ? " (by request)" : "";
}

function ColorRow({ legend, note, choices, value, onChange }: { legend: string; note?: string | undefined; choices: RegionColorChoices; value: string | undefined; onChange: (value: string) => void }) {
  return (
    <fieldset style={groupStyle}>
      <legend style={legendStyle}>{legend}</legend>
      {note && <small style={{ color: "var(--color-muted, #666)" }}>{note}</small>}
      <div style={rowStyle}>
        {choices.palette.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-pressed={value === color.id}
            aria-label={`${color.label}${statusText(color.status)}`}
            title={`${color.label}${statusText(color.status)}`}
            disabled={color.status === "discontinued"}
            onClick={() => onChange(color.id)}
            style={{ ...choiceStyle(value === color.id), width: "2.25rem", height: "2.25rem", padding: 2, opacity: color.status === "discontinued" ? 0.35 : 1 }}
          >
            <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 2, background: color.hexes ? `linear-gradient(90deg, ${color.hexes.join(", ")})` : color.hex }} />
          </button>
        ))}
        {choices.freeColor && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            Any color
            <input type="color" value={value?.startsWith("#") ? value : "#000000"} onChange={(event) => onChange(event.target.value)} />
          </label>
        )}
      </div>
    </fieldset>
  );
}

/** Choose a finish, options, colors, and a name, with the price updating from the server as they change. */
export function Customizer({ palette, finishes, artStyles = [], customization, currency, quote, addToCart, nameLabel, cartHref }: CustomizerProps) {
  const offered = useMemo(() => customization.finishIds.flatMap((id) => finishes.find((f) => f.id === id && f.status !== "discontinued") ?? []), [customization.finishIds, finishes]);
  const [finishId, setFinishId] = useState(offered[0]?.id ?? "");
  const [rawPicks, setRawPicks] = useState<Record<string, string>>({});
  const [rawSelection, setRawSelection] = useState<CustomizationSelection>({});
  const [artStyle, setArtStyle] = useState(customization.artStyleIds?.[0] ?? "");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<QuoteResult | null>(null);
  const [cartMessage, setCartMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, startAdding] = useTransition();
  const latestQuote = useRef(0);

  const finish = offered.find((f) => f.id === finishId);
  const picks = useMemo(() => normalizePicks(customization, rawPicks), [customization, rawPicks]);
  const variantId = useMemo(() => resolvePicks(customization, picks).variantId, [customization, picks]);
  const regions = useMemo(() => activeRegions(customization, variantId), [customization, variantId]);

  // Keep what the shopper chose wherever it's still allowed, and fall back to a default where it isn't.
  const selection = useMemo(() => {
    if (!finish) return {};
    const defaults = defaultSelection(palette, regions, finish);
    const merged: CustomizationSelection = {};
    for (const [slot, fallback] of Object.entries(defaults)) {
      const chosen = rawSelection[slot];
      let valid = chosen !== undefined;
      if (chosen !== undefined) {
        try {
          validateSelectedColor(availableColorChoices(palette, customization.regions, finish, slot), slot, chosen);
        } catch {
          valid = false;
        }
      }
      merged[slot] = valid ? chosen! : fallback;
    }
    return merged;
  }, [finish, palette, regions, customization.regions, rawSelection]);

  const input: LineInput = useMemo(
    () => ({
      finish: finishId,
      selection,
      picks,
      ...(artStyle ? { artStyle } : {}),
      ...(name.trim() ? { name: name.trim() } : {}),
    }),
    [finishId, selection, picks, artStyle, name],
  );

  useEffect(() => {
    const ticket = ++latestQuote.current;
    const timer = setTimeout(() => {
      quote(input).then(
        (result) => {
          if (ticket === latestQuote.current) setPrice(result);
        },
        () => {
          if (ticket === latestQuote.current) setPrice({ ok: false, error: "We couldn't price that. Try again." });
        },
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [input, quote]);

  const quoteRequired = price?.ok === true && price.quoteRequired;

  return (
    <form
      style={{ display: "grid", gap: "var(--space-md, 1rem)" }}
      onSubmit={(event) => {
        event.preventDefault();
        setCartMessage(null);
        startAdding(async () => {
          const result = await addToCart(input, quantity).catch((): AddToCartResult => ({ ok: false, error: "We couldn't add that to your cart. Try again." }));
          setCartMessage(result.ok ? { ok: true, text: "Added to your cart." } : { ok: false, text: result.error });
        });
      }}
    >
      {offered.length > 1 && (
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>Finish</legend>
          <div style={rowStyle}>
            {offered.map((f) => (
              <button key={f.id} type="button" aria-pressed={f.id === finishId} title={f.description} onClick={() => setFinishId(f.id)} style={choiceStyle(f.id === finishId)}>
                {f.label}
                {statusText(f.status)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {(customization.options ?? [])
        .filter((option) => isOptionVisible(option, picks))
        .map((option) => (
          <fieldset key={option.id} style={groupStyle}>
            <legend style={legendStyle}>{option.label}</legend>
            <div style={rowStyle}>
              {option.choices.map((choice) => {
                const available = isChoiceAvailable(choice, picks);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={picks[option.id] === choice.id}
                    disabled={!available}
                    title={choice.note}
                    onClick={() => setRawPicks({ ...picks, [option.id]: choice.id })}
                    style={{ ...choiceStyle(picks[option.id] === choice.id), opacity: available ? 1 : 0.4 }}
                  >
                    {choice.label}
                    {statusText(choice.status)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

      {finish?.colors === "single" ? (
        <ColorRow legend="Color" choices={availableColorChoices(palette, customization.regions, finish, "__all")} value={selection.__all} onChange={(value) => setRawSelection({ ...selection, __all: value })} />
      ) : (
        finish &&
        regions.map((region) => {
          const choices = availableColorChoices(palette, customization.regions, finish, region.id);
          if (choices.locked) return null;
          return <ColorRow key={region.id} legend={region.label} note={region.why} choices={choices} value={selection[region.id]} onChange={(value) => setRawSelection({ ...selection, [region.id]: value })} />;
        })
      )}

      {(customization.artStyleIds?.length ?? 0) > 1 && (
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>Art style</legend>
          <div style={rowStyle}>
            {customization.artStyleIds!.map((id) => {
              const style = artStyles.find((s) => s.id === id);
              return (
                <button key={id} type="button" aria-pressed={id === artStyle} disabled={style?.status === "discontinued"} title={style?.description} onClick={() => setArtStyle(id)} style={choiceStyle(id === artStyle)}>
                  {style?.label ?? id}
                  {statusText(style?.status)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {nameLabel && (
        <label style={{ display: "grid", gap: "0.25rem", fontWeight: 600 }}>
          {nameLabel}
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={72} style={{ font: "inherit", fontWeight: 400, padding: "0.5rem", borderRadius: "var(--radius, 4px)", border: "1px solid var(--color-border, #ccc)", background: "transparent", color: "inherit" }} />
        </label>
      )}

      <div aria-live="polite">
        {price === null && <p style={{ margin: 0, color: "var(--color-muted, #666)" }}>Pricing your choices…</p>}
        {price?.ok === false && <p role="alert" style={{ margin: 0 }}>{price.error}</p>}
        {price?.ok === true && <PriceBreakdown lines={price.lines} total={price.total} currency={currency} quoteRequired={price.quoteRequired} />}
      </div>

      <div style={{ ...rowStyle, alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          Quantity
          <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} style={{ width: "4rem", font: "inherit", padding: "0.4rem" }} />
        </label>
        <button
          type="submit"
          disabled={adding || price?.ok !== true || quoteRequired}
          style={{ padding: "0.6rem 1.25rem", font: "inherit", fontWeight: 600, cursor: "pointer", borderRadius: "var(--radius, 4px)", border: 0, background: "var(--color-primary, #333)", color: "var(--color-primary-foreground, #fff)", opacity: adding || price?.ok !== true || quoteRequired ? 0.5 : 1 }}
        >
          {quoteRequired ? "Needs a quote" : adding ? "Adding…" : "Add to cart"}
        </button>
      </div>
      {cartMessage && (
        <p role={cartMessage.ok ? "status" : "alert"} style={{ margin: 0 }}>
          {cartMessage.text} {cartMessage.ok && cartHref && <a href={cartHref}>View cart</a>}
        </p>
      )}
    </form>
  );
}
