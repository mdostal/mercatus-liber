import { printCoverage, type GarmentFlatSize } from "@mercatus-liber/print-art";

export interface PrintCoverageProps {
  /** The garment laid flat, in inches. */
  garment: GarmentFlatSize;
  /** The print's width and height, in inches. */
  print: readonly [number, number];
  /** How far below the collar the print starts, in inches. Default 3. */
  topInches?: number;
  /** The size label shown in the caption, such as "L". */
  size: string;
  /** Widest the drawing is drawn, in CSS pixels. Default 260. */
  maxWidth?: number;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The garment laid flat with the print drawn on it to scale, and a caption
 * saying how much of the width and length it covers. A print that is wider
 * than the garment or runs past the hem is outlined in the danger colour and
 * the caption says so.
 *
 * Colours come from the theming variables `--color-surface`, `--color-text`,
 * `--color-primary`, `--color-danger` and `--color-text-muted`.
 */
export function PrintCoverage({ garment, print, topInches = 3, size, maxWidth = 260 }: PrintCoverageProps) {
  const scale = 7;
  const W = garment.width * scale;
  const H = garment.length * scale;
  const pw = print[0] * scale;
  const ph = print[1] * scale;
  const top = topInches * scale;
  const { widthPercent, lengthPercent, fits } = printCoverage(garment, print, topInches);
  const mark = fits ? "var(--color-primary)" : "var(--color-danger, #b42318)";
  const label = `Size ${size}: ${fmt(garment.width)} by ${fmt(garment.length)} inch garment, ${fmt(print[0])} by ${fmt(print[1])} inch print, ${widthPercent}% of the width${fits ? "" : ", too big for this size"}`;
  // Room for a print that overhangs the garment, so the overhang shows instead of being clipped.
  const left = Math.min(0, (W - pw) / 2) - 6;
  const right = Math.max(W, (W + pw) / 2) + 6;
  const bottom = Math.max(H, top + ph) + 6;
  return (
    <figure style={{ margin: 0, display: "grid", gap: 6 }}>
      <svg viewBox={`${left} -6 ${right - left} ${bottom + 6}`} width={Math.min(right - left, maxWidth)} role="img" aria-label={label}>
        <rect x="0" y="0" width={W} height={H} rx="6" fill="var(--color-surface, #fff)" stroke="var(--color-text, #111)" strokeWidth="2" />
        <rect x={(W - pw) / 2} y={top} width={pw} height={ph} fill={mark} fillOpacity="0.35" stroke={mark} strokeWidth="2" strokeDasharray="6 4" />
        <text x={W / 2} y={top + ph / 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-text, #111)">
          {fmt(print[0])} × {fmt(print[1])} in
        </text>
      </svg>
      <figcaption style={{ fontSize: 13, color: "var(--color-text-muted, #555)" }}>
        Size {size}: garment {fmt(garment.width)} × {fmt(garment.length)} in flat. The print covers {widthPercent}% of the width and {lengthPercent}% of the length.
        {fits ? "" : " It does not fit this size."} To scale; drawn {fmt(topInches)} in below the collar.
      </figcaption>
    </figure>
  );
}
