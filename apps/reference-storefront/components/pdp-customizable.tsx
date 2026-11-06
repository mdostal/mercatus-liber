import type { ArtStyle, FinishTier, PaletteColor, ProductCustomization } from "@mercatus-liber/customization";
import { Customizer, type AddToCartResult, type QuoteResult } from "@mercatus-liber/storefront-ui";
import type { LineInput } from "@mercatus-liber/customization";

/** The product page for a made-to-order product: the customizer takes the place of the standard buy box, so a shopper has one way to buy it. */
export function PdpCustomizable({
  title,
  description,
  imageUrl,
  imageAlt,
  ...customizer
}: {
  title: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  palette: PaletteColor[];
  finishes: FinishTier[];
  artStyles: ArtStyle[];
  customization: ProductCustomization;
  currency: string;
  quote: (input: LineInput) => Promise<QuoteResult>;
  addToCart: (input: LineInput, quantity: number) => Promise<AddToCartResult>;
  nameLabel: string;
  cartHref: string;
}) {
  return (
    <main style={{ display: "grid", gap: "var(--space-lg, 2rem)", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", alignItems: "start" }}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={imageAlt ?? ""} style={{ width: "100%", height: "auto", borderRadius: "var(--radius, 4px)" }} />
      )}
      <div style={{ display: "grid", gap: "var(--space-md, 1rem)" }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p style={{ margin: 0, color: "var(--color-muted, #666)" }}>{description}</p>
        <Customizer {...customizer} />
      </div>
    </main>
  );
}
