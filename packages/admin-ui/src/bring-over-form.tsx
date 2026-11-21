"use client";

import { useId, useState, useTransition } from "react";

/** What the admin chose: the store product to create from a provider's item. Prices in cents. */
export interface BringOverSelection {
  title: string;
  slug: string;
  description: string;
  technique: string;
  colors: string[];
  sizes: string[];
  retailCents: number;
  sizeUpchargeCents: Record<string, number>;
  /** An art file URL per placement. Placements left empty get art later. */
  files: { placement: string; url: string }[];
}

export interface BringOverPlanRow {
  color: string;
  size: string;
  priceCents: number;
  costCents: number;
  marginCents: number;
}

export type BringOverPlanResult = { ok: true; rows: BringOverPlanRow[]; unavailable?: { color: string; size: string }[] } | { ok: false; error: string };
export type BringOverResult = { ok: true; message: string; href?: string } | { ok: false; error: string };

export interface BringOverFormProps {
  colors: { name: string; hex?: string }[];
  sizes: string[];
  techniques: { key: string; label: string }[];
  /** Where art can go, per technique. */
  placements: { key: string; label: string; technique: string; size?: string }[];
  defaults?: Partial<Pick<BringOverSelection, "title" | "slug" | "description" | "technique" | "retailCents">>;
  currency?: string;
  /** Works out each SKU's cost and margin for the current choices. */
  onPlan: (selection: BringOverSelection) => Promise<BringOverPlanResult>;
  /** Creates the store product. */
  onSubmit: (selection: BringOverSelection) => Promise<BringOverResult>;
  /** When set, the form is shown but can't be submitted, with this reason. */
  disabledReason?: string;
}

const field = { display: "grid", gap: 4, fontSize: 12 } as const;
const input = { fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderWidth: "1.5px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 6, background: "var(--color-surface, #fff)", color: "var(--color-text, #111)" } as const;
const groupTitle = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted, #555)", margin: 0 } as const;
const button = (primary: boolean) =>
  ({ fontFamily: "inherit", fontWeight: 700, padding: "8px 14px", borderRadius: 6, borderWidth: "2px", borderStyle: "solid", borderColor: "var(--color-text, #111)", background: primary ? "var(--color-primary, #333)" : "var(--color-surface, #fff)", color: primary ? "var(--color-on-primary, #fff)" : "var(--color-text, #111)", cursor: "pointer" }) as const;

/** "Unisex Staple T-Shirt" -> "unisex-staple-t-shirt". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "12.5" -> 1250; null when it isn't a non-negative amount. */
export function parseMoneyToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole = "0", frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/**
 * Choose what to bring into the store from a provider's item: name, technique,
 * colours, sizes, price (with optional per-size upcharges) and an art URL per
 * placement. "Work out costs" shows every SKU's cost and margin before
 * anything is created; "Bring over" creates it.
 */
export function BringOverForm({ colors, sizes, techniques, placements, defaults = {}, currency = "USD", onPlan, onSubmit, disabledReason }: BringOverFormProps) {
  const id = useId();
  const [title, setTitle] = useState(defaults.title ?? "");
  const [slug, setSlug] = useState(defaults.slug ?? slugify(defaults.title ?? ""));
  const [slugEdited, setSlugEdited] = useState(Boolean(defaults.slug));
  const [description, setDescription] = useState(defaults.description ?? "");
  const [technique, setTechnique] = useState(defaults.technique ?? techniques[0]?.key ?? "");
  const [chosenColors, setChosenColors] = useState<string[]>([]);
  const [chosenSizes, setChosenSizes] = useState<string[]>(sizes);
  const [price, setPrice] = useState(defaults.retailCents !== undefined ? (defaults.retailCents / 100).toFixed(2) : "");
  const [upcharges, setUpcharges] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<BringOverPlanResult | null>(null);
  const [result, setResult] = useState<BringOverResult | null>(null);
  const [pending, startTransition] = useTransition();
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  const forTechnique = placements.filter((p) => p.technique === technique);

  const selection = (): BringOverSelection | string => {
    const retailCents = parseMoneyToCents(price);
    if (!title.trim()) return "Give the product a name.";
    if (!slug) return "Give the product a URL slug.";
    if (chosenColors.length === 0) return "Choose at least one colour.";
    if (chosenSizes.length === 0) return "Choose at least one size.";
    if (retailCents === null) return "Enter a price, such as 24.00.";
    const sizeUpchargeCents: Record<string, number> = {};
    for (const [size, text] of Object.entries(upcharges)) {
      if (!text.trim() || !chosenSizes.includes(size)) continue;
      const cents = parseMoneyToCents(text);
      if (cents === null) return `The ${size} upcharge isn't an amount.`;
      if (cents > 0) sizeUpchargeCents[size] = cents;
    }
    return {
      title: title.trim(),
      slug,
      description: description.trim(),
      technique,
      colors: chosenColors,
      sizes: chosenSizes,
      retailCents,
      sizeUpchargeCents,
      files: forTechnique.map((p) => ({ placement: p.key, url: (files[p.key] ?? "").trim() })).filter((f) => f.url),
    };
  };

  const run = (kind: "plan" | "submit") => {
    const s = selection();
    if (typeof s === "string") {
      setResult({ ok: false, error: s });
      return;
    }
    setResult(null);
    startTransition(async () => {
      try {
        if (kind === "plan") setPlan(await onPlan(s));
        else setResult(await onSubmit(s));
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  };
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const changed = () => setPlan(null);

  return (
    <form
      aria-label="Bring into the store"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && !disabledReason) run("submit");
      }}
      style={{ display: "grid", gap: 16, padding: 14, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 8, background: "var(--color-surface, #fff)" }}
    >
      <h3 style={{ margin: 0, fontSize: 17 }}>Bring into the store</h3>
      {disabledReason && <p role="note" style={{ margin: 0, fontSize: 13 }}>{disabledReason}</p>}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
        <label style={field} htmlFor={`${id}-title`}>
          Name
          <input
            id={`${id}-title`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            style={input}
          />
        </label>
        <label style={field} htmlFor={`${id}-slug`}>
          URL slug
          <input
            id={`${id}-slug`}
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugEdited(true);
            }}
            style={input}
          />
        </label>
        <label style={field} htmlFor={`${id}-technique`}>
          Technique
          <select
            id={`${id}-technique`}
            value={technique}
            onChange={(e) => {
              setTechnique(e.target.value);
              changed();
            }}
            style={input}
          >
            {techniques.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label style={field} htmlFor={`${id}-price`}>
          Price ({currency})
          <input
            id={`${id}-price`}
            inputMode="decimal"
            value={price}
            placeholder="24.00"
            onChange={(e) => {
              setPrice(e.target.value);
              changed();
            }}
            style={input}
          />
        </label>
      </div>
      <label style={field} htmlFor={`${id}-description`}>
        Description
        <textarea id={`${id}-description`} value={description} rows={3} onChange={(e) => setDescription(e.target.value)} style={{ ...input, resize: "vertical" }} />
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
        <legend style={groupTitle}>
          Colours ({chosenColors.length} of {colors.length})
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {colors.map((c) => (
            <label key={c.name} data-color={c.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "3px 7px", borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 6 }}>
              <input
                type="checkbox"
                checked={chosenColors.includes(c.name)}
                onChange={() => {
                  setChosenColors(toggle(chosenColors, c.name));
                  changed();
                }}
              />
              {c.hex && <span aria-hidden style={{ width: 11, height: 11, borderRadius: "50%", background: c.hex, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)" }} />}
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
        <legend style={groupTitle}>Sizes and upcharges</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {sizes.map((s) => (
            <span key={s} data-size={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={chosenSizes.includes(s)}
                  onChange={() => {
                    setChosenSizes(toggle(chosenSizes, s));
                    changed();
                  }}
                />
                {s}
              </label>
              {chosenSizes.includes(s) && (
                <input
                  aria-label={`${s} upcharge`}
                  inputMode="decimal"
                  placeholder="+0"
                  value={upcharges[s] ?? ""}
                  onChange={(e) => {
                    setUpcharges({ ...upcharges, [s]: e.target.value });
                    changed();
                  }}
                  style={{ ...input, width: 54, padding: "3px 5px", fontSize: 12 }}
                />
              )}
            </span>
          ))}
        </div>
      </fieldset>

      {forTechnique.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend style={groupTitle}>Art (optional now; add it later)</legend>
          {forTechnique.map((p) => (
            <label key={p.key} style={field} htmlFor={`${id}-file-${p.key}`}>
              {p.label}
              {p.size ? ` (${p.size})` : ""}
              <input
                id={`${id}-file-${p.key}`}
                type="url"
                placeholder="https://…/print-file.png"
                value={files[p.key] ?? ""}
                onChange={(e) => {
                  setFiles({ ...files, [p.key]: e.target.value });
                  changed();
                }}
                style={input}
              />
            </label>
          ))}
        </fieldset>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" disabled={pending} onClick={() => run("plan")} style={button(false)}>
          Work out costs
        </button>
        <button type="submit" disabled={pending || Boolean(disabledReason)} style={{ ...button(true), opacity: disabledReason ? 0.5 : 1 }}>
          {pending ? "Working…" : "Bring over"}
        </button>
      </div>

      {plan && !plan.ok && <p role="alert" style={{ margin: 0, color: "var(--color-danger, #b42318)", fontSize: 13 }}>{plan.error}</p>}
      {plan?.ok && (
        <div style={{ overflowX: "auto" }}>
          <table data-plan style={{ borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                {["Colour", "Size", "Price", "Cost", "Margin"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 8px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={`${r.color}|${r.size}`} style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--color-border, #ccc)" }}>
                  <td style={{ padding: "3px 8px" }}>{r.color}</td>
                  <td style={{ padding: "3px 8px" }}>{r.size}</td>
                  <td style={{ padding: "3px 8px" }}>{money(r.priceCents)}</td>
                  <td style={{ padding: "3px 8px" }}>{money(r.costCents)}</td>
                  <td data-margin style={{ padding: "3px 8px", fontWeight: 700, color: r.marginCents <= 0 ? "var(--color-danger, #b42318)" : "inherit" }}>
                    {money(r.marginCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.unavailable?.length ? <p style={{ fontSize: 12, margin: "6px 0 0" }}>Not made: {plan.unavailable.map((u) => `${u.color} ${u.size}`).join(", ")}.</p> : null}
        </div>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} style={{ margin: 0, fontSize: 13, color: result.ok ? "inherit" : "var(--color-danger, #b42318)" }}>
          {result.ok ? result.message : result.error}
          {result.ok && result.href && (
            <>
              {" "}
              <a href={result.href}>Open it</a>
            </>
          )}
        </p>
      )}
    </form>
  );
}
