import type { CatalogService } from "@mercatus-liber/catalog";
import type { CustomizationService, FinishTier, PaletteColor, PricingRules, PricingService } from "@mercatus-liber/customization";

const PRODUCT_SLUG = "embroidered-dad-cap";

const PALETTE: PaletteColor[] = [
  { id: "khaki", label: "Khaki", hex: "#B9A27C" },
  { id: "navy", label: "Navy", hex: "#1D2B4F" },
  { id: "forest", label: "Forest", hex: "#22543D" },
  { id: "white", label: "White", hex: "#F4F4F2" },
  { id: "red", label: "Red", hex: "#B3261E" },
  { id: "gold", label: "Metallic gold", hex: "#C9A227", status: "request", note: "Ordered in when you ask for it." },
];

const FINISHES: FinishTier[] = [
  { id: "one-color", rank: 1, label: "One color", colors: "single", description: "Crown, brim, and thread all in one color.", producesSeparateParts: false },
  { id: "custom", rank: 2, label: "Mix colors", colors: "palette", description: "Choose the crown, brim, and thread separately.", producesSeparateParts: false },
];

/** Sample numbers for the demo store, editable under Admin > Customization. Saved once, so an admin's edits survive a restart. */
const RULES: PricingRules = {
  basePriceCents: { "one-color": 2400, custom: 2600 },
  attributes: [
    { id: "extraColor", label: "Each extra color", perUnitCents: 150 },
    { id: "longName", label: "Each letter past 8", perUnitCents: 50 },
    { id: "leatherPatch", label: "Leather patch", perUnitCents: 400 },
    { id: "customHardware", label: "Custom hardware", perUnitCents: 0, quoteOnly: true },
  ],
  colorMarkupCents: { gold: 300 },
  excessUnitRules: [
    { attributeId: "extraColor", source: "colorChanges", freeUnits: 0 },
    { attributeId: "longName", source: "nameLength", freeUnits: 8 },
  ],
};

/** Gives the Print Shop's dad cap a working customizer, as a public example of the whole flow. Only fills in what's missing, so re-running can't undo an admin's changes. */
export async function seedCustomizationExample(deps: { catalog: CatalogService; customization: CustomizationService; pricing: PricingService }): Promise<void> {
  const { catalog, customization, pricing } = deps;
  const product = await catalog.getProductBySlug(PRODUCT_SLUG);
  if (!product) return;

  const existingColors = new Set((await customization.listPalette()).map((c) => c.id));
  for (const color of PALETTE) if (!existingColors.has(color.id)) await customization.setPaletteColor(color);
  const existingFinishes = new Set((await customization.listFinishTiers()).map((f) => f.id));
  for (const finish of FINISHES) if (!existingFinishes.has(finish.id)) await customization.setFinishTier(finish);

  if (!(await customization.getProductCustomizationByProductId(product.id))) {
    await customization.createProductCustomization({
      productId: product.id,
      finishIds: FINISHES.map((f) => f.id),
      regions: [
        { id: "crown", label: "Crown", defaultHex: "#B9A27C", separable: true },
        { id: "brim", label: "Brim", defaultHex: "#B9A27C", separable: true },
        { id: "thread", label: "Thread", defaultHex: "#1D2B4F", separable: true },
        { id: "patch", label: "Patch stitching", defaultHex: "#1D2B4F", separable: true, when: { patch: ["leather"] } },
      ],
      options: [
        { id: "patch", label: "Front", choices: [{ id: "embroidered", label: "Embroidered directly" }, { id: "leather", label: "Leather patch", attributeId: "leatherPatch" }] },
        { id: "strap", label: "Strap", choices: [{ id: "brass", label: "Brass buckle" }, { id: "custom", label: "Custom hardware", status: "request", attributeId: "customHardware", note: "Priced by hand." }] },
      ],
      variants: {
        key: "patch",
        rows: [
          { id: "embroidered", label: "Embroidered", when: { patch: "embroidered" } },
          { id: "leather", label: "Leather patch", when: { patch: "leather" } },
        ],
      },
    });
  }
  if (!(await pricing.getRules(product.id))) await pricing.saveRules(product.id, RULES);
}
