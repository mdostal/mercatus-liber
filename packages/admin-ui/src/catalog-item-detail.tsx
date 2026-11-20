"use client";

import type { ReactNode } from "react";

export interface VariantCell {
  /** What one unit costs, already formatted, e.g. "$13.92". */
  cost?: string;
  /** False when out of stock or not made in this colour and size. */
  available?: boolean;
  /** A short note shown on hover, such as the regions it sells in. */
  note?: string;
}

export interface PrintAreaRow {
  label: string;
  technique?: string;
  /** e.g. "12 × 16 in, 1800 × 2400 px at 150 dpi". */
  size?: string;
  /** e.g. "+$5.95". */
  price?: string;
}

export interface CatalogItemDetailProps {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  description?: string;
  colors: { name: string; hex?: string }[];
  sizes: string[];
  /** Per `${color}|${size}`. Missing cells show as not made. */
  cells?: Record<string, VariantCell>;
  printAreas?: PrintAreaRow[];
  /** Links such as "Back to the catalog" or the store products made from this item. */
  links?: { label: string; href: string }[];
  /** A note about what is or isn't shown, such as "Costs need a Printful token". */
  notice?: ReactNode;
  /** Shown after the details, such as a form to bring the item into the store. */
  children?: ReactNode;
}

const heading = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted, #555)", margin: "0 0 6px" } as const;
const cellBase = { padding: "4px 6px", borderTop: "1px solid var(--color-border, #ccc)", fontVariantNumeric: "tabular-nums", fontSize: 12, textAlign: "center" } as const;

/** The key CatalogItemDetail reads cells by. */
export const variantCellKey = (color: string, size: string) => `${color}|${size}`;

/**
 * One item a provider makes: picture and description, a colour by size table
 * with each variant's cost and availability, and the print areas with their
 * sizes. Children go underneath, such as a form to bring it into the store.
 */
export function CatalogItemDetail({ name, subtitle, imageUrl, description, colors, sizes, cells = {}, printAreas = [], links = [], notice, children }: CatalogItemDetailProps) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", alignItems: "start" }}>
        {imageUrl && <img src={imageUrl} alt={name} style={{ width: "100%", maxWidth: 420, aspectRatio: "1", objectFit: "contain", borderRadius: 8, border: "1px solid var(--color-border, #ccc)", background: "var(--color-surface, #fff)" }} />}
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, textWrap: "balance" }}>{name}</h2>
          {subtitle && <p style={{ margin: 0, color: "var(--color-text-muted, #555)" }}>{subtitle}</p>}
          {links.length > 0 && (
            <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13 }}>
              {links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </p>
          )}
          {notice && <div role="note" style={{ fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px dashed var(--color-border, #ccc)" }}>{notice}</div>}
          {description && <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-line", maxWidth: "65ch" }}>{description}</p>}
        </div>
      </div>

      {printAreas.length > 0 && (
        <section>
          <h3 style={heading}>Print areas</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
              <tbody>
                {printAreas.map((a, i) => (
                  <tr key={`${a.label}-${a.technique ?? ""}-${i}`} data-print-area={a.label} style={{ borderTop: "1px solid var(--color-border, #ccc)" }}>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{a.label}</td>
                    <td style={{ padding: "4px 8px", color: "var(--color-text-muted, #555)" }}>{a.technique}</td>
                    <td style={{ padding: "4px 8px", fontVariantNumeric: "tabular-nums" }}>{a.size}</td>
                    <td style={{ padding: "4px 8px", fontVariantNumeric: "tabular-nums" }}>{a.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {colors.length > 0 && sizes.length > 0 && (
        <section>
          <h3 style={heading}>
            {colors.length} colours × {sizes.length} sizes
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...cellBase, borderTop: "none", textAlign: "left" }}>Colour</th>
                  {sizes.map((s) => (
                    <th key={s} scope="col" style={{ ...cellBase, borderTop: "none" }}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => (
                  <tr key={c.name} data-color={c.name}>
                    <th scope="row" style={{ ...cellBase, textAlign: "left", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {c.hex && <span aria-hidden style={{ display: "inline-block", width: 11, height: 11, borderRadius: "50%", background: c.hex, border: "1px solid var(--color-border, #ccc)", marginRight: 6, verticalAlign: -1 }} />}
                      {c.name}
                    </th>
                    {sizes.map((s) => {
                      const cell = cells[variantCellKey(c.name, s)];
                      const made = cell !== undefined;
                      const available = made && cell.available !== false;
                      return (
                        <td key={s} title={cell?.note} data-cell={variantCellKey(c.name, s)} style={{ ...cellBase, color: available ? "inherit" : "var(--color-text-muted, #999)" }}>
                          {!made ? "–" : cell.cost ?? (available ? "✓" : "")}
                          {made && !available && <span> out</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {children}
    </div>
  );
}
