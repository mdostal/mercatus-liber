"use client";

import type { ReactNode } from "react";

export interface RatingReason {
  /** Who gave the score: a person, a persona, a panel member. */
  rater: string;
  score: number;
  reason: string;
}

export interface RatingRow {
  id: string;
  /** What was rated, in one line. */
  label: ReactNode;
  /** Shown under the label, such as the angle or the full text. */
  detail?: ReactNode;
  mean: number;
  /** Standard deviation of the scores. */
  sd: number;
  min: number;
  max: number;
  reasons: RatingReason[];
}

export interface RatingsTableProps<R extends RatingRow> {
  rows: R[];
  /** Adds a "Use this" button to each row. */
  onUse?: (row: R) => void;
  useLabel?: string;
  /** One line above the rows saying who rated what, when, and on what scale. */
  caption?: ReactNode;
  /** Digits after the decimal point for mean and spread. Default 1. */
  digits?: number;
}

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontVariantNumeric: "tabular-nums" } as const;

/**
 * Candidates ranked by their average score, highest first, each with its
 * spread and range; open a row to read every rater's score and reason.
 * Rows are sorted here, so pass them in any order.
 */
export function RatingsTable<R extends RatingRow>({ rows, onUse, useLabel = "Use this", caption, digits = 1 }: RatingsTableProps<R>) {
  const ranked = [...rows].sort((a, b) => b.mean - a.mean || a.sd - b.sd);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {caption && <p style={{ margin: "0 0 2px", fontSize: 13, color: "var(--color-text-muted, #555)" }}>{caption}</p>}
      {ranked.map((row, i) => (
        <details key={row.id} data-row={row.id} style={{ borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 8, background: "var(--color-surface, #fff)" }}>
          <summary style={{ cursor: "pointer", padding: "10px 12px", display: "grid", gridTemplateColumns: onUse ? "auto 1fr auto" : "auto 1fr", gap: 12, alignItems: "baseline" }}>
            <span style={{ ...mono, fontWeight: 700 }}>{row.mean.toFixed(digits)}</span>
            <span style={{ minWidth: 0 }}>
              <b>{row.label}</b>
              <span style={{ fontSize: 12, color: "var(--color-text-muted, #555)" }}>
                {" "}
                · #{i + 1} · spread {row.sd.toFixed(digits)} · range {row.min}–{row.max} · {row.reasons.length} {row.reasons.length === 1 ? "rating" : "ratings"}
              </span>
            </span>
            {onUse && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onUse(row);
                }}
                style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "4px 8px", borderRadius: 6, borderWidth: "2px", borderStyle: "solid", borderColor: "var(--color-text, #111)", background: "var(--color-surface, #fff)", color: "var(--color-text, #111)", cursor: "pointer" }}
              >
                {useLabel}
              </button>
            )}
          </summary>
          <div style={{ padding: "0 12px 12px", fontSize: 13 }}>
            {row.detail && <div style={{ margin: "0 0 8px" }}>{row.detail}</div>}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[...row.reasons]
                    .sort((a, b) => b.score - a.score)
                    .map((r, j) => (
                      <tr key={`${r.rater}-${j}`} style={{ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--color-border, #ccc)" }}>
                        <td style={{ ...mono, padding: "4px 6px", fontWeight: 700, width: 28 }}>{r.score}</td>
                        <td style={{ padding: "4px 6px", width: "34%", color: "var(--color-text-muted, #555)" }}>{r.rater}</td>
                        <td style={{ padding: "4px 6px" }}>{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Mean, standard deviation (population), min and max of a set of scores, for building rows. */
export function summarizeScores(scores: readonly number[]): { mean: number; sd: number; min: number; max: number } {
  if (scores.length === 0) return { mean: 0, sd: 0, min: 0, max: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return { mean, sd, min: Math.min(...scores), max: Math.max(...scores) };
}
