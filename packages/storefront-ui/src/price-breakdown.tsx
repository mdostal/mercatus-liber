import type { PriceLine } from "@mercatus-liber/customization/client";

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export interface PriceBreakdownProps {
  lines: PriceLine[];
  total: number;
  currency: string;
  /** Shown instead of a final total when a choice has to be quoted by hand. */
  quoteRequired?: boolean;
}

/** Each charge gets its own step of the theme's primary color, so segments stay distinct in any theme. */
function segmentColor(index: number, count: number): string {
  const strength = count <= 1 ? 100 : Math.round(100 - (index / count) * 70);
  return `color-mix(in srgb, var(--color-primary, #333) ${strength}%, var(--color-background, #fff))`;
}

/** What a price is made of: a bar showing each charge's share of the total, and the same charges as an itemized list. */
export function PriceBreakdown({ lines, total, currency, quoteRequired = false }: PriceBreakdownProps) {
  const charges = lines.filter((line) => line.amount > 0);
  const chargeTotal = charges.reduce((sum, line) => sum + line.amount, 0);
  const colorOf = new Map(charges.map((line, index) => [line.id, segmentColor(index, charges.length)]));

  return (
    <section aria-label="Price breakdown" style={{ display: "grid", gap: "var(--space-sm, 0.75rem)" }}>
      <div
        aria-hidden="true"
        data-testid="price-chart"
        style={{ display: "flex", gap: 2, height: "0.75rem", borderRadius: "var(--radius, 4px)", overflow: "hidden" }}
      >
        {charges.map((line) => (
          <div key={line.id} data-line={line.id} style={{ flexGrow: line.amount / chargeTotal, flexBasis: 0, background: colorOf.get(line.id) }} />
        ))}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", columnGap: "var(--space-xs, 0.5rem)", rowGap: "0.25rem", margin: 0, fontVariantNumeric: "tabular-nums" }}>
        {lines.map((line) => (
          <div key={line.id} style={{ display: "contents" }}>
            <span aria-hidden="true" style={{ width: "0.75rem", height: "0.75rem", alignSelf: "center", borderRadius: 2, background: colorOf.get(line.id) ?? "transparent" }} />
            <dt style={{ color: "var(--color-muted, #666)" }}>{line.label}</dt>
            <dd style={{ margin: 0, textAlign: "right" }}>{formatMoney(line.amount, currency)}</dd>
          </div>
        ))}
        <div style={{ display: "contents", fontWeight: 700 }}>
          <span />
          <dt>{quoteRequired ? "Starting price" : "Total"}</dt>
          <dd data-testid="price-total" style={{ margin: 0, textAlign: "right" }}>
            {formatMoney(total, currency)}
          </dd>
        </div>
      </dl>
      {quoteRequired && <p style={{ margin: 0, color: "var(--color-muted, #666)" }}>One of your choices is priced by hand, so we&apos;ll send a quote.</p>}
    </section>
  );
}
