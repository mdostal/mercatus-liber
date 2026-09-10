import { randomUUID } from "node:crypto";
import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { PromotionsService } from "@mercatus-liber/promotions";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";

interface DemoProduct {
  slug: string;
  title: string;
  description: string;
  color: string;
  size: string;
  priceCents: number;
  categorySlugs: string[];
  stockUnits: number;
  /**
   * Whether this product's PDP shows a real personalization text input
   * ("Personalize this item (e.g. embroidery text, thread color)") that
   * flows into the cart line's optional customizationNote field (see
   * @mercatus-liber/cart's CartItem doc comment and design-discussion.md
   * §1b). The single source of truth for this flag -- isCustomizableProduct
   * below reads it straight off this array, so seed data and PDP behavior
   * can never drift out of sync.
   */
  customizable: boolean;
  /**
   * image-cdn epic: one real, topically-matched LoremFlickr photo per
   * product (see Product.images's doc comment, @mercatus-liber/core) --
   * `url` is a real, working, key-less LoremFlickr URL
   * (https://loremflickr.com/800/600/<keyword1>,<keyword2>) chosen from the
   * product's actual title/description, never a generic placeholder.
   */
  images: { url: string; alt: string }[];
}

/**
 * print-shop-02: a real embroidery/custom-print catalog (design-
 * discussion.md §0/§1b) across 4 real categories -- Embroidery, Custom
 * Coasters, Apparel, Drinkware -- replacing the old dragon-themed
 * desk-accessory catalog wholesale (see print-shop-01's commit for the pure
 * slug/identifier rename that preceded this). "Embroidered Fleece Hoodie" is
 * deliberately assigned to BOTH "embroidery" and "apparel" (a real
 * embroidered garment genuinely belongs in both), proving many-to-many
 * category assignment the same way the old organizer/mat pair proved it via
 * "desk-accessories". Real names/descriptions/prices in cents, zero lorem
 * ipsum, per this story's acceptance criteria.
 *
 * demo-store-catalog-depth: this original 8-product catalog read as a
 * single bad landing page rather than a real shop, so this pass ~3x's it
 * (mirrors lib/seed-northline.ts's northline-depth-02 "~4x catalog-depth"
 * pass on the same principle) with real, distinct single-SKU products across
 * the same 4 categories plus one new 5th category, "Stickers & Patches", a
 * genuine fit for a small-batch embroidery/print shop (iron-on/woven patches
 * pair naturally with the embroidery line; vinyl stickers are a real
 * low-cost print-shop staple). Real multi-SKU tiered variants (the "Trailing
 * Pothos" pattern from lib/seed-broadleaf.ts -- one generateSkus call per
 * tier so each tier carries its own price/stock) live separately in
 * DEMO_VARIANT_PRODUCTS below, since this array's shape is single-SKU-per-
 * product. Every genuinely embroidered/monogrammed new product keeps this
 * story's existing naming convention of leading its title with "Embroidered"
 * (or "Embroidered ..."), the same substring isCustomizableProduct-adjacent
 * search-index behavior the original 4 embroidered products already relied
 * on -- see test/marketing-catalog-search.test.ts's "embroidered" full-text
 * query assertion, updated alongside this pass to the real, larger match
 * set.
 */
const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "embroidered-canvas-tote",
    title: "Embroidered Canvas Tote Bag",
    description:
      "A heavyweight 12oz natural canvas tote with reinforced stitched handles, embroidered to order with your text, initials, or a small custom design.",
    color: "natural-canvas",
    size: "one-size",
    priceCents: 2800,
    categorySlugs: ["embroidery"],
    stockUnits: 12,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/tote,canvas?lock=1", alt: "Natural canvas tote bag with a printed design, carried over the shoulder" }],
  },
  {
    slug: "embroidered-dad-cap",
    title: "Embroidered Dad Cap",
    description:
      "An unstructured low-profile cotton twill cap with an adjustable brass buckle strap, embroidered front-and-center with your own text or monogram.",
    color: "khaki",
    size: "one-size",
    priceCents: 2400,
    categorySlugs: ["embroidery"],
    stockUnits: 5,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/cap,baseball?lock=1", alt: "Navy blue baseball-style cap with a curved brim" }],
  },
  {
    slug: "monogram-stoneware-coaster-set",
    title: "Monogram Stoneware Coaster Set (Set of 4)",
    description:
      "Four absorbent stoneware coasters with a cork backing, laser-etched with a monogram or short custom text of your choosing. Packaged in a kraft gift box.",
    color: "slate-gray",
    size: "4-pack",
    priceCents: 3200,
    categorySlugs: ["custom-coasters"],
    stockUnits: 35,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/coaster?lock=1", alt: "Set of patterned stoneware-style coasters resting on a wooden table" }],
  },
  {
    slug: "cork-back-print-coaster-set",
    title: "Cork-Backed Print Coaster Set (Set of 6)",
    description:
      "Six round hardboard coasters with a natural cork backing and a full-color printed top -- our standard in-house pattern, ready to ship as-is.",
    color: "natural-cork",
    size: "6-pack",
    priceCents: 2600,
    categorySlugs: ["custom-coasters"],
    stockUnits: 50,
    customizable: false,
    images: [{ url: "https://loremflickr.com/800/600/coaster,cork?lock=1", alt: "Round cork-backed coaster resting on a stone surface" }],
  },
  {
    slug: "embroidered-fleece-hoodie",
    title: "Embroidered Fleece Hoodie",
    description:
      "A midweight 8.5oz cotton-poly fleece pullover hoodie with a kangaroo pocket, embroidered on the left chest with your text or a small custom design.",
    color: "heather-gray",
    size: "medium",
    priceCents: 5400,
    // Shared category (an embroidered garment genuinely belongs in both) --
    // proves many-to-many category assignment.
    categorySlugs: ["embroidery", "apparel"],
    stockUnits: 25,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/hoodie,fleece?lock=1", alt: "Pullover hoodie with a colorful printed graphic on display" }],
  },
  {
    slug: "embroidered-cotton-tee",
    title: "Embroidered Cotton T-Shirt",
    description:
      "A 100% ringspun cotton crewneck tee, embroidered (not printed) on the left chest with your own text, initials, or small design.",
    color: "navy",
    size: "medium",
    priceCents: 2200,
    categorySlugs: ["apparel"],
    stockUnits: 45,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/tshirt,cotton?lock=1", alt: "Striped cotton crewneck t-shirt displayed on a mannequin" }],
  },
  {
    slug: "custom-printed-ceramic-mug",
    title: "Custom-Printed Ceramic Mug",
    description:
      "An 11oz glossy white ceramic mug, dishwasher- and microwave-safe, full-color printed edge-to-edge with your own text, photo, or design.",
    color: "white",
    size: "11oz",
    priceCents: 1800,
    categorySlugs: ["drinkware"],
    stockUnits: 55,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/mug,ceramic?lock=1", alt: "Dark ceramic coffee mug photographed in dramatic lighting" }],
  },
  {
    slug: "custom-printed-travel-tumbler",
    title: "Custom-Printed Travel Tumbler",
    description:
      "A 20oz double-wall insulated stainless steel tumbler with a spill-resistant lid -- our standard in-house wrap design, ready to ship as-is.",
    color: "matte-black",
    size: "20oz",
    priceCents: 2600,
    categorySlugs: ["drinkware"],
    stockUnits: 40,
    customizable: false,
    images: [{ url: "https://loremflickr.com/800/600/thermos,steel?lock=1", alt: "Stainless steel travel thermos with visible condensation droplets" }],
  },
  // -- demo-store-catalog-depth additions below (14 new single-SKU
  // products; 4 more real multi-SKU tiered products live in
  // DEMO_VARIANT_PRODUCTS below) --
  {
    slug: "embroidered-zip-pouch",
    title: "Embroidered Zip Pouch",
    description:
      "A compact water-resistant canvas zip pouch, right for cards or small tools, embroidered with your initials or a short custom design.",
    color: "natural-canvas",
    size: "one-size",
    priceCents: 1600,
    categorySlugs: ["embroidery"],
    stockUnits: 28,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/makeup-bag?lock=1", alt: "Striped zip pouch with small items laid out beside it" }],
  },
  {
    slug: "embroidered-luggage-tag",
    title: "Embroidered Luggage Tag",
    description:
      "A sturdy vegetable-tanned leather luggage tag with a brass buckle strap, embroidered on the backing panel with your name or initials.",
    color: "chestnut-brown",
    size: "one-size",
    priceCents: 1400,
    categorySlugs: ["embroidery"],
    stockUnits: 20,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/luggage-tag,leather?lock=1", alt: "Brown leather luggage tag with a buckle strap" }],
  },
  {
    slug: "embroidered-canvas-apron",
    title: "Embroidered Canvas Apron",
    description:
      "A heavyweight canvas work apron with an adjustable neck strap and a large front pocket, embroidered on the chest with your name, shop name, or a small custom design.",
    color: "natural-canvas",
    size: "one-size",
    // Shared category (a worn embroidered garment genuinely belongs in
    // both), same many-to-many pattern as the Embroidered Fleece Hoodie
    // above.
    categorySlugs: ["embroidery", "apparel"],
    priceCents: 3400,
    stockUnits: 16,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/apron,waitress?lock=1", alt: "Person wearing a work apron over their clothing" }],
  },
  {
    slug: "kids-embroidered-tee",
    title: "Kids' Embroidered Tee",
    description:
      "A soft 100% cotton youth crewneck tee, embroidered (not printed) on the chest with your child's name, initials, or a small custom design.",
    color: "light-blue",
    size: "youth-medium",
    priceCents: 1900,
    categorySlugs: ["embroidery", "apparel"],
    stockUnits: 24,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/boy,tshirt?lock=1", alt: "Person wearing a plain crewneck t-shirt" }],
  },
  {
    slug: "birch-wood-slice-coaster-set",
    title: "Birch Wood Slice Coaster Set (Set of 4)",
    description:
      "Four natural birch wood slice coasters with a protective matte sealant, laser-etched with a monogram or short custom text. Packaged in a kraft gift box.",
    color: "natural-birch",
    size: "4-pack",
    priceCents: 3600,
    categorySlugs: ["custom-coasters"],
    stockUnits: 22,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/coaster,birch?lock=1", alt: "Stack of natural wood slice coasters on a lace doily" }],
  },
  {
    slug: "marbled-resin-coaster-set",
    title: "Marbled Resin Coaster Set (Set of 4)",
    description:
      "Four hand-poured resin coasters in a swirled marble pattern with a cork backing -- our standard in-house colorway, ready to ship as-is.",
    color: "ivory-marble",
    size: "4-pack",
    priceCents: 3000,
    categorySlugs: ["custom-coasters"],
    stockUnits: 30,
    customizable: false,
    images: [{ url: "https://loremflickr.com/800/600/coaster,agate?lock=1", alt: "Round coaster with a pink and white marbled pattern" }],
  },
  {
    slug: "leather-coaster-set",
    title: "Leather Coaster Set (Set of 4)",
    description:
      "Four thick vegetable-tanned leather coasters, hand-cut and edge-burnished, deboss-stamped with a monogram or short custom text of your choosing.",
    color: "saddle-tan",
    size: "4-pack",
    priceCents: 4200,
    categorySlugs: ["custom-coasters"],
    stockUnits: 18,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/leather,round?lock=1", alt: "Close-up of a round leather surface with visible stitching" }],
  },
  {
    slug: "custom-etched-pint-glass-set",
    title: "Custom-Etched Pint Glass Set (Set of 2)",
    description:
      "Two 16oz glass pint glasses, permanently laser-etched with your own text, initials, or a small design -- dishwasher-safe, no ink to fade.",
    color: "clear-glass",
    size: "2-pack",
    priceCents: 2400,
    categorySlugs: ["drinkware"],
    stockUnits: 34,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/glass,beer?lock=1", alt: "Glass filled with beer, beaded with condensation" }],
  },
  {
    slug: "custom-printed-enamel-camp-mug",
    title: "Custom-Printed Enamel Camp Mug",
    description:
      "A 12oz classic speckled enamel camp mug with a rolled rim, full-color printed edge-to-edge with your own text, photo, or design.",
    color: "speckled-black",
    size: "12oz",
    priceCents: 1600,
    categorySlugs: ["drinkware"],
    stockUnits: 38,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/mug,speckled?lock=1", alt: "Two-tone speckled ceramic camp mug" }],
  },
  {
    slug: "custom-printed-can-cooler-set",
    title: "Custom-Printed Can Cooler Set (Set of 4)",
    description:
      "Four neoprene slim-can coolers with a stitched seam, full-color printed with our standard in-house pattern -- ready to ship as-is.",
    color: "assorted",
    size: "4-pack",
    priceCents: 2200,
    categorySlugs: ["drinkware"],
    stockUnits: 40,
    customizable: false,
    images: [{ url: "https://loremflickr.com/800/600/beer,can?lock=1", alt: "Row of beer cans beside a poured glass" }],
  },
  {
    slug: "custom-vinyl-sticker-sheet",
    title: "Custom Vinyl Sticker Sheet",
    description:
      "A weatherproof matte vinyl sticker sheet, cut to your own text or small design -- dishwasher- and sun-safe for water bottles, laptops, and cars.",
    color: "assorted",
    size: "one-sheet",
    priceCents: 1200,
    categorySlugs: ["stickers-patches"],
    stockUnits: 60,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/sticker,laptop?lock=1", alt: "Sheet of small rectangular stickers with printed logos" }],
  },
  {
    slug: "embroidered-iron-on-patch-set",
    title: "Embroidered Iron-On Patch Set (Set of 3)",
    description:
      "Three twill-backed embroidered patches with a heat-activated iron-on backing, stitched to order with your text, initials, or a small custom design.",
    color: "assorted",
    size: "3-pack",
    // Shared category -- a genuinely embroidered product that also belongs
    // in the new Stickers & Patches category, same many-to-many pattern as
    // the Embroidered Fleece Hoodie above.
    categorySlugs: ["embroidery", "stickers-patches"],
    priceCents: 1800,
    stockUnits: 26,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/patch,embroidery?lock=1", alt: "Round embroidered patch with a map and lettering design" }],
  },
  {
    slug: "woven-name-patch-set",
    title: "Woven Name Patch Set (Set of 6)",
    description:
      "Six sew-on woven labels, finely dye-sublimated with your name or a short custom text -- a lightweight stitch-free alternative for gear tags and clothing labels.",
    color: "black-on-white",
    size: "6-pack",
    priceCents: 1600,
    categorySlugs: ["stickers-patches"],
    stockUnits: 32,
    customizable: true,
    images: [{ url: "https://loremflickr.com/800/600/patch,woven?lock=1", alt: "Tomato-shaped embroidered patch on a white background" }],
  },
  {
    slug: "die-cut-vinyl-sticker-pack",
    title: "Die-Cut Vinyl Sticker Pack (Pack of 10)",
    description:
      "Ten die-cut glossy vinyl stickers in our standard in-house shop designs -- ready to ship as-is, no customization needed.",
    color: "assorted",
    size: "10-pack",
    priceCents: 1000,
    categorySlugs: ["stickers-patches"],
    stockUnits: 70,
    customizable: false,
    images: [{ url: "https://loremflickr.com/800/600/decal,car?lock=1", alt: "Die-cut vinyl decal shaped like a dog silhouette" }],
  },
];

interface DemoProductTier {
  /** Becomes the SKU's "size" identifying attribute -- e.g. "small" / "0-3m" / "20oz". */
  size: string;
  /** Human label for the tier (PDP-facing, mirrors lib/seed-broadleaf.ts's ProductTier.label). */
  label: string;
  priceCents: number;
  stockUnits: number;
}

/**
 * A real multi-SKU tiered product -- mirrors lib/seed-broadleaf.ts's
 * "Trailing Pothos" ProductTier pattern (one generateSkus call per tier, so
 * each tier carries its own distinct price and stock) rather than
 * DEMO_PRODUCTS' single-SKU-per-product shape above. `color` is held fixed
 * across all of a product's tiers (only `size` varies per tier) since none
 * of these 4 products need per-tier color variation.
 */
interface DemoVariantProduct {
  slug: string;
  title: string;
  description: string;
  color: string;
  categorySlugs: string[];
  customizable: boolean;
  tiers: DemoProductTier[];
  /**
   * image-cdn epic: one real, topically-matched LoremFlickr photo shared
   * across every tier/SKU of this product (see DemoProduct.images's doc
   * comment above -- images live on the shared Product, not per-tier/SKU).
   */
  images: { url: string; alt: string }[];
}

/**
 * demo-store-catalog-depth: 4 real tiered products (proves this pass isn't
 * just 18 more flat single-SKU listings) -- a baby onesie in 3 real infant
 * sizes, an embroidered pullover and a screen-printed sweatshirt each in 4
 * real adult sizes, and an insulated water bottle in 2 real capacities, each
 * size at its own real price point.
 */
const DEMO_VARIANT_PRODUCTS: DemoVariantProduct[] = [
  {
    slug: "embroidered-baby-onesie",
    title: "Embroidered Baby Onesie",
    description:
      "A soft 100% cotton snap-front onesie, embroidered on the chest with baby's name or a small custom design -- a keepsake-quality baby gift.",
    color: "natural-white",
    categorySlugs: ["embroidery", "apparel"],
    customizable: true,
    tiers: [
      { size: "0-3m", label: "0-3 months", priceCents: 2000, stockUnits: 18 },
      { size: "3-6m", label: "3-6 months", priceCents: 2000, stockUnits: 18 },
      { size: "6-12m", label: "6-12 months", priceCents: 2000, stockUnits: 14 },
    ],
    images: [{ url: "https://loremflickr.com/800/600/onesie,baby?lock=2", alt: "Striped baby onesie laid flat" }],
  },
  {
    slug: "embroidered-quarter-zip-pullover",
    title: "Embroidered Quarter-Zip Pullover",
    description:
      "A midweight brushed-fleece quarter-zip pullover with a chest pocket, embroidered on the left chest with your text or a small custom design.",
    color: "heather-navy",
    // Shared category (a worn embroidered garment genuinely belongs in
    // both), same many-to-many pattern as the Embroidered Fleece Hoodie
    // above.
    categorySlugs: ["embroidery", "apparel"],
    customizable: true,
    tiers: [
      { size: "small", label: "Small", priceCents: 4800, stockUnits: 20 },
      { size: "medium", label: "Medium", priceCents: 4800, stockUnits: 26 },
      { size: "large", label: "Large", priceCents: 4800, stockUnits: 22 },
      { size: "x-large", label: "X-Large", priceCents: 4800, stockUnits: 12 },
    ],
    images: [{ url: "https://loremflickr.com/800/600/fleece,pullover?lock=1", alt: "Person wearing a fleece pullover jacket outdoors" }],
  },
  {
    slug: "screen-printed-crewneck-sweatshirt",
    title: "Screen-Printed Crewneck Sweatshirt",
    description:
      "A heavyweight 10oz cotton-poly fleece crewneck sweatshirt, screen-printed front and center with our standard in-house shop logo design.",
    color: "charcoal-heather",
    categorySlugs: ["apparel"],
    customizable: false,
    tiers: [
      { size: "small", label: "Small", priceCents: 4600, stockUnits: 20 },
      { size: "medium", label: "Medium", priceCents: 4600, stockUnits: 28 },
      { size: "large", label: "Large", priceCents: 4600, stockUnits: 24 },
      { size: "x-large", label: "X-Large", priceCents: 4600, stockUnits: 14 },
    ],
    images: [{ url: "https://loremflickr.com/800/600/crewneck?lock=1", alt: "Orange and gray raglan-sleeve crewneck sweatshirt on a hanger" }],
  },
  {
    slug: "custom-printed-insulated-water-bottle",
    title: "Custom-Printed Insulated Water Bottle",
    description:
      "A double-wall vacuum-insulated stainless steel water bottle with a leakproof lid -- our standard in-house wrap design, ready to ship as-is.",
    color: "matte-forest",
    categorySlugs: ["drinkware"],
    customizable: false,
    tiers: [
      { size: "20oz", label: "20oz", priceCents: 2800, stockUnits: 32 },
      { size: "32oz", label: "32oz", priceCents: 3400, stockUnits: 24 },
    ],
    images: [{ url: "https://loremflickr.com/800/600/bottle,steel?lock=1", alt: "Stainless steel insulated water bottle standing upright" }],
  },
];

/**
 * Reads the "is this product customizable" flag straight off DEMO_PRODUCTS
 * and DEMO_VARIANT_PRODUCTS above (the single source of truth for the seed
 * data's customizable tag -- see DemoProduct's doc comment) so the PDP
 * (app/demo/[demoSlug]/products/[slug]/page.tsx) can decide whether to show
 * the personalization input without re-declaring the flag anywhere else.
 * Returns false for any slug not in these print-shop-specific arrays (e.g. a
 * northline product slug) -- correct, since northline isn't a customization
 * demo.
 */
export function isCustomizableProduct(slug: string): boolean {
  if (DEMO_PRODUCTS.some((product) => product.slug === slug && product.customizable)) return true;
  return DEMO_VARIANT_PRODUCTS.some((product) => product.slug === slug && product.customizable);
}

interface ServiceDemoSku {
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  stockUnits: number;
}

/**
 * Three single-variant, service-style demo products backing the 3-tier
 * bundle acceptance demo (bundle-04). Shape inspiration: the ATT recreation's
 * confirmed PDP direction, a 3-tier package selector ("Product Only" / "+ Pro
 * Setup" / "Complete Overhaul") -- see design-discussion.md §0. That repo is
 * referenced only as shape inspiration; none of its content is read or
 * copied here. `install` is the bundle's base product; `proSetup` and
 * `overhaul` are add-on SKUs only ever sold as part of a tier, never listed
 * standalone in DEMO_PRODUCTS. Rebranded to print-shop's own embroidery
 * business (print-shop-02) so no "Dragon"-branded content survives under
 * "The Print Shop" name -- this bundle-04 acceptance demo is otherwise
 * untouched by this story (it's a separate SKU family from DEMO_PRODUCTS,
 * never listed in the real catalog/nav).
 */
const SERVICE_DEMO_SKUS: { install: ServiceDemoSku; proSetup: ServiceDemoSku; overhaul: ServiceDemoSku } = {
  install: {
    slug: "onsite-embroidery-setup",
    title: "On-Site Embroidery Setup Service",
    description: "A technician visits your space to set up and calibrate your new embroidery equipment, done right the first time.",
    priceCents: 4900,
    stockUnits: 999,
  },
  proSetup: {
    slug: "onsite-embroidery-pro-setup-addon",
    title: "Pro Setup Add-On",
    description: "Adds thread-path calibration, hooping-station setup, and a full pro configuration pass.",
    priceCents: 2900,
    stockUnits: 999,
  },
  overhaul: {
    slug: "onsite-embroidery-complete-overhaul-addon",
    title: "Complete Overhaul Add-On",
    description: "Adds a full equipment teardown, deep clean, and rebuild to factory-fresh spec.",
    priceCents: 5900,
    stockUnits: 999,
  },
};

/** Creates one active product + one active SKU for a single-variant service demo SKU (identifyingAttributeKeys is a single "package" key with one "standard" value -- these aren't multi-variant products, just a minimal non-empty key set so generateSkus produces exactly one SKU). */
async function createServiceDemoSku(
  catalog: CatalogService,
  inventory: InventoryAdapter,
  demo: ServiceDemoSku,
): Promise<{ productId: string; skuId: string }> {
  const product = await catalog.createProduct({
    slug: demo.slug,
    title: demo.title,
    description: demo.description,
    identifyingAttributeKeys: ["package"],
  });
  await catalog.publishProduct(product.id);
  const skus = await catalog.generateSkus(
    product.id,
    { package: ["standard"] },
    { amount: demo.priceCents, currency: "USD" },
  );
  const sku = skus[0]!;
  await inventory.setStock(sku.id, demo.stockUnits);
  return { productId: product.id, skuId: sku.id };
}

/**
 * Seeds the bundle-04 acceptance demo: the 3 service-style SKUs above, plus
 * one Bundle attached to the base "install" product with exactly 3 tiers,
 * each tier's skuIds the correct CUMULATIVE set -- tier 1 is [install], tier
 * 2 is [install, proSetup], tier 3 is [install, proSetup, overhaul]. Mirrors
 * the ATT recreation's confirmed 3-tier package-selector shape (see
 * design-discussion.md §0) using this repo's own print-shop-branded demo
 * data -- the ATT recreation repo itself is never read or touched.
 */
async function seedServiceBundle(catalog: CatalogService, inventory: InventoryAdapter, bundles: BundlesService): Promise<void> {
  const install = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.install);
  const proSetup = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.proSetup);
  const overhaul = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.overhaul);

  await bundles.createBundle({
    productId: install.productId,
    title: "Embroidery Setup Service Packages",
    tiers: [
      { id: randomUUID(), label: "Product Only", skuIds: [install.skuId] },
      { id: randomUUID(), label: "+ Pro Setup", skuIds: [install.skuId, proSetup.skuId] },
      { id: randomUUID(), label: "Complete Overhaul", skuIds: [install.skuId, proSetup.skuId, overhaul.skuId] },
    ],
  });
}

/**
 * Seeds print-shop's 5 real categories, all top-level (parentId: null) --
 * same "every real category is top-level" shape northline-depth-02 already
 * proved for Northline (see app/demo/[demoSlug]/layout.tsx's buildNavLinks
 * doc comment), so every one of these 5 automatically surfaces in the demo
 * nav via that already-built, demo-aware navLinks mechanism -- zero new nav
 * code needed (print-shop-02's Part 4). "Stickers & Patches" is new as of
 * demo-store-catalog-depth -- a genuine fit for a small-batch
 * embroidery/print shop, not a bolt-on catch-all.
 */
async function seedCategories(marketingCatalog: MarketingCatalogService): Promise<Map<string, string>> {
  const embroidery = await marketingCatalog.createCategory({
    slug: "embroidery",
    title: "Embroidery",
    description: "Totes, caps, and more, embroidered to order with your own text or a small custom design.",
    parentId: null,
  });
  const customCoasters = await marketingCatalog.createCategory({
    slug: "custom-coasters",
    title: "Custom Coasters",
    description: "Stoneware and cork-backed coaster sets, from a monogrammed custom order to our standard in-house prints.",
    parentId: null,
  });
  const apparel = await marketingCatalog.createCategory({
    slug: "apparel",
    title: "Apparel",
    description: "Hoodies and tees, embroidered on the chest with your own text or design.",
    parentId: null,
  });
  const drinkware = await marketingCatalog.createCategory({
    slug: "drinkware",
    title: "Drinkware",
    description: "Mugs and tumblers, custom-printed with your own text, photo, or design.",
    parentId: null,
  });
  const stickersPatches = await marketingCatalog.createCategory({
    slug: "stickers-patches",
    title: "Stickers & Patches",
    description: "Embroidered and woven patches, plus vinyl stickers -- custom-cut to order or ready to ship as-is.",
    parentId: null,
  });

  return new Map([
    [embroidery.slug, embroidery.id],
    [customCoasters.slug, customCoasters.id],
    [apparel.slug, apparel.id],
    [drinkware.slug, drinkware.id],
    [stickersPatches.slug, stickersPatches.id],
  ]);
}

/** Seeds a CMS-authored home page (hero banner + category spot) and one live marketing/campaign page with a curated mini-catalog. */
async function seedCmsPages(cms: CmsService, productIdBySlug: Map<string, string>): Promise<void> {
  const home = await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Home",
    sections: [
      {
        componentType: "hero-banner",
        config: {
          headline: "The Print Shop",
          subheadline: "Embroidery, custom coasters, apparel, and drinkware -- personalized to order. New drops every season.",
        },
      },
      {
        componentType: "category-spot",
        config: { categorySlugs: ["embroidery", "custom-coasters"] },
      },
      {
        // Renders via components/cms-sections.tsx's AdSlot, resolved against
        // pageSlug="home" (see app/page.tsx) -- see seedAdvertising below
        // for the untargeted campaign this slot picks up.
        componentType: "ad-slot",
        config: {},
      },
    ],
  });
  await cms.publishPage(home.id);

  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const { page: campaign } = await cms.createMarketingPage({
    slug: "fall-sale",
    title: "Fall Sale",
    sections: toteId ? [{ componentType: "product-grid", config: { productIds: [toteId] } }] : [],
    campaignName: "Fall Sale 2026",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    productIds: toteId ? [toteId] : [],
  });
  await cms.publishPage(campaign.id);
}

/**
 * Seeds a handful of demo service areas (generic local pickup/delivery
 * regions for this print-shop demo shop -- see epic 15a/15b for the real
 * ATT-style business seed data). The dad cap is deliberately assigned to
 * only 2 of the 3 areas, proving a product can be available in a subset of
 * areas, not all-or-nothing. Also publishes one CMS "location" page,
 * proving the ServiceArea-data / CMS-page-layout split end to end. Returns
 * Portland's real ServiceArea id so callers (see seedAdvertising) can seed
 * a campaign explicitly targeted at it, proving targeting discrimination
 * against real seed data rather than a synthetic id.
 */
async function seedServiceAreas(
  serviceAreas: ServiceAreaService,
  cms: CmsService,
  productIdBySlug: Map<string, string>,
): Promise<string> {
  const portland = await serviceAreas.createServiceArea({
    slug: "portland-or",
    name: "Portland, OR",
    region: "Pacific Northwest",
    description: "Local pickup and delivery for Portland-area customers.",
    phone: "(555) 555-0110",
  });
  const austin = await serviceAreas.createServiceArea({
    slug: "austin-tx",
    name: "Austin, TX",
    region: "Texas",
    description: "Local pickup and delivery for the Austin area.",
    phone: "(555) 555-0120",
  });
  const chicago = await serviceAreas.createServiceArea({
    slug: "chicago-il",
    name: "Chicago, IL",
    region: "Midwest",
    description: "Local pickup for Chicago-area customers.",
    phone: null,
  });

  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const capId = productIdBySlug.get("embroidered-dad-cap");

  for (const area of [portland, austin, chicago]) {
    if (toteId) await serviceAreas.assignProductToServiceArea(toteId, area.id);
  }
  for (const area of [portland, austin]) {
    if (capId) await serviceAreas.assignProductToServiceArea(capId, area.id);
  }

  const locationPage = await cms.createPage({
    pageType: "location",
    slug: portland.slug,
    title: portland.name,
    sections: [
      { componentType: "service-area-info", config: { hours: "Mon-Fri 9am-5pm" } },
      {
        // Renders via components/cms-sections.tsx's AdSlot, resolved against
        // pageSlug="portland-or" AND serviceAreaId=portland.id (see
        // app/locations/[slug]/page.tsx) -- see seedAdvertising below for
        // the service-area-targeted campaign this slot picks up.
        componentType: "ad-slot",
        config: {},
      },
    ],
  });
  await cms.publishPage(locationPage.id);

  return portland.id;
}

/**
 * Seeds the rec-04 acceptance demo: one curated, active RecommendationRule
 * from the Embroidered Canvas Tote Bag to the Embroidered Dad Cap, placement
 * "both" (so it satisfies both the PDP and cart resolution paths -- see
 * resolvePdpRecommendations/resolveCartRecommendations in
 * components/recommendation-shelf.tsx), labeled "Customers also bought". The
 * two products already share the "embroidery" category (see DEMO_PRODUCTS
 * above), so this also reads naturally as a real "customers also bought"
 * pairing, and the dad cap itself is left with no curated rule of its own --
 * its PDP demonstrates the same-category fallback shelf instead (it falls
 * back to the tote bag via that shared category).
 */
async function seedRecommendations(
  recommendations: RecommendationsService,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const capId = productIdBySlug.get("embroidered-dad-cap");
  if (!toteId || !capId) return;

  await recommendations.createRule({
    sourceProductId: toteId,
    label: "Customers also bought",
    placement: "both",
    targetProductIds: [capId],
  });
}

/**
 * Seeds the ad-04 acceptance demo: one untargeted, active Campaign with 2
 * creatives (proving weighted-random rotation is at least wired, even
 * though any single render only shows one -- see
 * AdvertisingService.getActiveCreativeForSlot), plus, when a service area
 * is available to target, a SECOND campaign explicitly targeted to that
 * area's real id with distinct creative content -- proving targeting
 * actually discriminates rather than "any campaign renders everywhere".
 * See design-discussion.md §3 and components/cms-sections.tsx's AdSlot.
 */
async function seedAdvertising(advertising: AdvertisingService, targetedServiceAreaId?: string): Promise<void> {
  await advertising.createCampaign({
    name: "Print Shop Sale",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: null, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: "The Print Shop Sale -- 20% Off Everything",
        body: "Embroidery, custom coasters, apparel, and drinkware -- all personalized to order, all on sale this week only.",
        imageUrl: null,
        linkHref: "/demo/print-shop/category/embroidery",
        weight: 1,
      },
      {
        id: randomUUID(),
        headline: "New: Embroidered Dad Cap Restock",
        body: "Our best-selling embroidered dad cap is back in stock. Grab yours before it's gone again.",
        imageUrl: null,
        linkHref: "/demo/print-shop/products/embroidered-dad-cap",
        weight: 1,
      },
    ],
  });

  if (!targetedServiceAreaId) return;

  await advertising.createCampaign({
    name: "Portland Print Shop Pop-Up",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: targetedServiceAreaId, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: "Portland Print Shop Pop-Up This Saturday",
        body: "Meet the print shop team in person at our Portland pop-up -- local pickup discounts all day.",
        imageUrl: null,
        linkHref: "/demo/print-shop/locations/portland-or",
        weight: 1,
      },
    ],
  });
}

/** Seeds a handful of demo products/SKUs (published/active) with real stock, category assignments, and CMS pages. `serviceAreas` is optional -- most test files don't need location-page coverage. `bundles` is optional too -- most test files don't need the bundle-04 acceptance demo (3 service SKUs + one 3-tier Bundle); see seedServiceBundle. `recommendations` is optional too -- most test files don't need the rec-04 acceptance demo (one curated RecommendationRule); see seedRecommendations. `advertising` is optional too -- most test files don't need the ad-04 acceptance demo (1-2 Campaigns); see seedAdvertising. */
export async function seedCatalog(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
  serviceAreas?: ServiceAreaService,
  bundles?: BundlesService,
  recommendations?: RecommendationsService,
  advertising?: AdvertisingService,
  promotions?: PromotionsService,
): Promise<void> {
  const categoryIdBySlug = await seedCategories(marketingCatalog);
  const productIdBySlug = new Map<string, string>();

  for (const demo of DEMO_PRODUCTS) {
    const product = await catalog.createProduct({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      identifyingAttributeKeys: ["color", "size"],
      images: demo.images,
    });
    productIdBySlug.set(demo.slug, product.id);
    await catalog.publishProduct(product.id);
    const skus = await catalog.generateSkus(
      product.id,
      { color: [demo.color], size: [demo.size] },
      { amount: demo.priceCents, currency: "USD" },
    );
    // catalog.sku.created already initialized each SKU at onHand=0 via the
    // inventory subscriber -- this sets the real seeded stock level.
    for (const sku of skus) {
      await inventory.setStock(sku.id, demo.stockUnits);
    }

    for (const categorySlug of demo.categorySlugs) {
      const categoryId = categoryIdBySlug.get(categorySlug);
      if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
    }
  }

  // Real multi-SKU tiered products (DemoVariantProduct's doc comment) --
  // one generateSkus call per tier so each tier gets its own real
  // price/stock, mirroring lib/seed-broadleaf.ts's Trailing Pothos pattern.
  for (const demo of DEMO_VARIANT_PRODUCTS) {
    const product = await catalog.createProduct({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      identifyingAttributeKeys: ["color", "size"],
      images: demo.images,
    });
    productIdBySlug.set(demo.slug, product.id);
    await catalog.publishProduct(product.id);

    for (const tier of demo.tiers) {
      const skus = await catalog.generateSkus(
        product.id,
        { color: [demo.color], size: [tier.size] },
        { amount: tier.priceCents, currency: "USD" },
      );
      // catalog.sku.created already initialized each SKU at onHand=0 via the
      // inventory subscriber -- this sets the real seeded stock level.
      for (const sku of skus) {
        await inventory.setStock(sku.id, tier.stockUnits);
      }
    }

    for (const categorySlug of demo.categorySlugs) {
      const categoryId = categoryIdBySlug.get(categorySlug);
      if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
    }
  }

  await seedCmsPages(cms, productIdBySlug);
  let portlandServiceAreaId: string | undefined;
  if (serviceAreas) portlandServiceAreaId = await seedServiceAreas(serviceAreas, cms, productIdBySlug);
  if (bundles) await seedServiceBundle(catalog, inventory, bundles);
  if (recommendations) await seedRecommendations(recommendations, productIdBySlug);
  if (advertising) await seedAdvertising(advertising, portlandServiceAreaId);
}
