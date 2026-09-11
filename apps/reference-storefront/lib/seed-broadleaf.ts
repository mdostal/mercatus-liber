import { randomUUID } from "node:crypto";
import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { PromotionsService } from "@mercatus-liber/promotions";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ReviewsService } from "@mercatus-liber/reviews";

/**
 * Epic demo-store-plant-shop's third public demo: "Broadleaf & Co.", an
 * eclectic small-batch goods shop -- see
 * .pHive/epics/demo-store-plant-shop/docs/design-discussion.md for the
 * resolved brand/category identity. Real small-batch Etsy-style sellers
 * rarely sell just one thing, so this is plants as one category among
 * several handmade-goods categories, not a single-category plant store.
 *
 * Physical stocked goods, closer in spirit to lib/seed.ts's
 * DEMO_PRODUCTS/generateSkus pattern than to lib/seed-northline.ts's
 * service-area-based one -- so no ServiceAreaService dependency here.
 *
 * **Correction, found post-deployment**: this used to claim inventory was
 * "intentionally not seeded" on the assumption an unset SKU behaves as
 * always-available -- not true. packages/inventory/src/subscriber.ts's
 * `catalog.sku.created` handler unconditionally sets every new SKU's stock
 * to a real, tracked 0 the instant it's created (a deliberate, tested
 * contract -- see packages/inventory/test/subscriber.test.ts), so every
 * one of these real physical products silently showed "in stock: 0" /
 * schema.org OutOfStock. Fixed with a real, explicit small-batch stock
 * count per SKU (15 units -- a plausible small-batch quantity, not an
 * "unlimited" sentinel the way Northline's services use, since these are
 * genuinely finite handmade goods).
 */
const DEFAULT_STOCK_UNITS = 15;

interface DemoCategory {
  slug: string;
  title: string;
  description: string;
}

const DEMO_CATEGORIES: DemoCategory[] = [
  {
    slug: "plants",
    title: "Plants",
    description: "Real, living houseplants -- easy-care trailing vines to statement floor plants.",
  },
  {
    slug: "ceramics-planters",
    title: "Ceramics & Planters",
    description: "Hand-thrown stoneware and glazed ceramics, made in small batches for the home.",
  },
  {
    slug: "textiles-fiber-arts",
    title: "Textiles & Fiber Arts",
    description: "Hand-woven wall hangings and chunky knits, worked one piece at a time.",
  },
  {
    slug: "paper-ephemera",
    title: "Paper & Ephemera",
    description: "Letterpress cards and botanical prints for the wall, the desk, and the mailbox.",
  },
  {
    slug: "candles-home-fragrance",
    title: "Candles & Home Fragrance",
    description: "Hand-poured soy candles and botanical room sprays, made in small batches close to home.",
  },
];

/**
 * real-store-depth epic: real subcategories under 2 of the 5 top-level
 * categories above -- these naturally split further the way a real
 * small-batch shop's own nav would (a "Plants" landing page with dozens of
 * SKUs genuinely benefits from an easy-care/statement split; "Ceramics &
 * Planters" genuinely splits into things-you-plant-in and
 * things-you-drink-or-eat-from). `parentSlug` must be one of
 * DEMO_CATEGORIES's own slugs above. Each subcategory is assigned to its
 * real products IN ADDITION TO (not instead of) that product's existing
 * top-level category assignment from DEMO_PRODUCTS -- see
 * app/demo/[demoSlug]/category/[slug]/page.tsx's real "Shop by:" child-
 * category nav and real parent breadcrumb, both already built and wired to
 * marketingCatalog.listChildCategories/getCategory, so seeding a real
 * parentId here is the only thing needed to light both up.
 */
interface DemoSubcategory {
  slug: string;
  title: string;
  description: string;
  parentSlug: string;
  /** Real DEMO_PRODUCTS slugs to additionally assign to this subcategory. */
  productSlugs: string[];
}

const DEMO_SUBCATEGORIES: DemoSubcategory[] = [
  {
    slug: "easy-care-houseplants",
    title: "Easy-Care Houseplants",
    description: "Forgiving, low-fuss houseplants that shrug off a missed watering or a dim corner.",
    parentSlug: "plants",
    productSlugs: ["trailing-pothos", "snake-plant", "zz-plant", "chinese-money-plant"],
  },
  {
    slug: "statement-plants",
    title: "Statement Plants",
    description: "Big, dramatic floor plants built to anchor a room.",
    parentSlug: "plants",
    productSlugs: ["fiddle-leaf-fig", "monstera-deliciosa", "rubber-plant"],
  },
  {
    slug: "planters-vases",
    title: "Planters & Vases",
    description: "Hand-thrown planters and vases for real living plants and cut stems.",
    parentSlug: "ceramics-planters",
    productSlugs: ["speckled-ceramic-planter", "terracotta-hanging-planter", "bud-vase-trio", "carved-stoneware-vase"],
  },
  {
    slug: "mugs-tableware",
    title: "Mugs & Tableware",
    description: "Hand-thrown mugs, bowls, and dishes for everyday use at the table.",
    parentSlug: "ceramics-planters",
    productSlugs: ["stoneware-mug-set", "reactive-glaze-serving-bowl", "ceramic-trinket-dish-set"],
  },
];

/**
 * real-store-depth epic: one real, redeemable, on-brand cart-scope coupon --
 * 15% off the whole order, no minimum, no expiry, unlimited redemptions
 * (a simple always-on promo, the same shape a genuine small shop would run
 * indefinitely). Referenced by exact code below by seedMarketingCampaign's
 * creative copy, so the ad on the home page and the actual redeemable
 * promotion can never drift out of sync with each other.
 */
const BLOOM_PROMO_CODE = "BLOOM15";
const BLOOM_PROMO_PERCENT_OFF = 15;

/**
 * One priced tier of a variant product (mirrors lib/seed-northline.ts's
 * ServiceTier -- one generateSkus call per tier so each tier can carry its
 * own distinct price). `stockUnits` is optional and defaults to
 * DEFAULT_STOCK_UNITS -- most tiers use the default small-batch quantity,
 * but a few (a one-of-a-kind hand-carved piece, a slow hand-dipped candle
 * pair) carry a genuinely smaller real count, and a couple of the
 * higher-volume printed paper goods carry a genuinely larger one.
 */
interface ProductTier {
  size: string;
  label: string;
  priceCents: number;
  stockUnits?: number;
}

interface DemoProduct {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  /**
   * Single-tier products use identifyingAttributeKeys: ["size"] with one
   * tier (priced flat, mirroring lib/seed.ts's DEMO_PRODUCTS single-variant
   * convention); the Trailing Pothos below uses three real pot-size tiers,
   * each its own generateSkus call at its own price -- the same tiering
   * pattern lib/seed-northline.ts's DEMO_SERVICES uses for a multi-tier
   * service.
   */
  tiers: ProductTier[];
  /**
   * One real, topically-matched photo per product, sourced from LoremFlickr
   * (a genuine keyword-matched Creative-Commons Flickr photo service, no
   * API key required) -- see catalog.createProduct's own images field.
   * Lives on the shared Product, not per-tier/per-SKU, even for multi-tier
   * products like the Trailing Pothos.
   */
  image: { url: string; alt: string };
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "trailing-pothos",
    title: "Trailing Pothos",
    description:
      "A classic Epipremnum aureum with heart-shaped variegated leaves that trail beautifully from a shelf or hanging planter. Thrives in low-to-bright indirect light and forgives the occasional missed watering.",
    categorySlug: "plants",
    tiers: [
      { size: "small-4in", label: "Small (4\" pot)", priceCents: 1200 },
      { size: "medium-6in", label: "Medium (6\" pot)", priceCents: 1800 },
      { size: "large-10in", label: "Large (10\" pot)", priceCents: 3200 },
    ],
    image: {
      url: "https://loremflickr.com/800/600/pothos,plant?lock=1",
      alt: "A trailing pothos plant with variegated heart-shaped leaves in a hanging pot",
    },
  },
  {
    slug: "snake-plant",
    title: "Snake Plant",
    description:
      "Dracaena trifasciata, stiff upright leaves banded in deep green and silver-gray. One of the most forgiving houseplants there is -- happy in low light and comfortable going weeks between waterings.",
    categorySlug: "plants",
    tiers: [{ size: "medium-6in", label: "Medium (6\" pot)", priceCents: 2200 }],
    image: {
      url: "https://loremflickr.com/800/600/snake-plant,succulent?lock=1",
      alt: "A snake plant with tall upright variegated leaves in a pot",
    },
  },
  {
    slug: "fiddle-leaf-fig",
    title: "Fiddle Leaf Fig",
    description:
      "Ficus lyrata, the statement floor plant with broad, glossy violin-shaped leaves. Wants bright indirect light and a consistent spot -- it does not love being moved around.",
    categorySlug: "plants",
    tiers: [{ size: "large-10in", label: "Large (10\" pot)", priceCents: 4800 }],
    image: {
      url: "https://loremflickr.com/800/600/fiddle-leaf-fig,houseplant?lock=1",
      alt: "A fiddle leaf fig plant with broad glossy leaves in a floor planter",
    },
  },
  {
    slug: "speckled-ceramic-planter",
    title: "Speckled Ceramic Planter",
    description:
      "A hand-thrown stoneware planter finished in a warm speckled glaze, with a drainage hole and matching saucer. Each piece is thrown individually, so glaze pooling varies slightly from one to the next.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "6in", label: "6-inch", priceCents: 3400 }],
    image: {
      url: "https://loremflickr.com/800/600/ceramic-planter,pottery?lock=1",
      alt: "A hand-thrown speckled ceramic planter with a matching saucer",
    },
  },
  {
    slug: "stoneware-mug-set",
    title: "Hand-Thrown Stoneware Mug Set",
    description:
      "A set of two hand-thrown 12oz stoneware mugs in a matte reactive glaze. Microwave- and dishwasher-safe, no two mugs glazed exactly alike.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "set-of-2", label: "Set of 2", priceCents: 4200 }],
    image: {
      url: "https://loremflickr.com/800/600/stoneware-mug,pottery?lock=1",
      alt: "A pair of hand-thrown stoneware mugs in a matte reactive glaze",
    },
  },
  {
    slug: "handwoven-wall-hanging",
    title: "Hand-Woven Wall Hanging",
    description:
      "A wall hanging hand-woven on a floor loom from natural cotton and wool roving in cream and rust tones, finished with a driftwood dowel.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "24x36in", label: "24 x 36 in", priceCents: 8800 }],
    image: {
      url: "https://loremflickr.com/800/600/wall-hanging,weaving?lock=1",
      alt: "A hand-woven wall hanging in cream and rust tones on a driftwood dowel",
    },
  },
  {
    slug: "chunky-knit-throw",
    title: "Chunky Knit Throw Blanket",
    description:
      "A hand-knit throw blanket worked in a super-bulky merino wool blend for a soft, oversized-stitch texture. Warm enough for a couch on a cold night, light enough for year-round use.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "50x60in", label: "50 x 60 in", priceCents: 12800 }],
    image: {
      url: "https://loremflickr.com/800/600/knit-blanket,throw?lock=1",
      alt: "A chunky hand-knit throw blanket in a soft oversized-stitch texture",
    },
  },
  {
    slug: "letterpress-card-set",
    title: "Letterpress Card Set",
    description:
      "A set of eight letterpress-printed cards on heavyweight cotton paper, each hand-fed through a vintage platen press. Blank inside, kraft envelopes included.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-8", label: "Set of 8", priceCents: 2400 }],
    image: {
      url: "https://loremflickr.com/800/600/letterpress,greeting-cards?lock=1",
      alt: "A set of letterpress-printed cards with kraft envelopes",
    },
  },
  {
    slug: "botanical-print",
    title: "Botanical Print",
    description:
      "An archival giclee print of an original ink botanical study, printed on heavyweight matte cotton paper. Ships flat in a rigid mailer, ready to frame.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "11x14in", label: "11 x 14 in", priceCents: 2800 }],
    image: {
      url: "https://loremflickr.com/800/600/botanical-print,illustration?lock=1",
      alt: "An archival giclee print of an ink botanical study",
    },
  },

  // -- Plants (additional varieties) --------------------------------------
  {
    slug: "monstera-deliciosa",
    title: "Monstera Deliciosa",
    description:
      "The iconic split-leaf philodendron cousin, prized for its dramatic fenestrated leaves. A fast, vigorous grower in bright indirect light -- give it a moss pole to climb and it rewards you with ever-larger splits.",
    categorySlug: "plants",
    tiers: [
      { size: "small-4in", label: "Small (4\" pot)", priceCents: 1800 },
      { size: "medium-6in", label: "Medium (6\" pot)", priceCents: 3200 },
      { size: "large-10in", label: "Large (10\" pot)", priceCents: 6800, stockUnits: 8 },
    ],
    image: {
      url: "https://loremflickr.com/800/600/monstera,houseplant?lock=1",
      alt: "A Monstera deliciosa plant with dramatic split, fenestrated leaves",
    },
  },
  {
    slug: "zz-plant",
    title: "ZZ Plant",
    description:
      "Zamioculcas zamiifolia, with glossy dark-green leaves on thick upright stems that store water like succulents. Tolerates low light and long dry spells -- about as close to unkillable as a houseplant gets.",
    categorySlug: "plants",
    tiers: [{ size: "medium-6in", label: "Medium (6\" pot)", priceCents: 2600 }],
    image: {
      url: "https://loremflickr.com/800/600/zz-plant,houseplant?lock=1",
      alt: "A ZZ plant with glossy dark-green leaves on thick upright stems",
    },
  },
  {
    slug: "chinese-money-plant",
    title: "Chinese Money Plant",
    description:
      "Pilea peperomioides, the pass-it-along plant -- round coin-shaped leaves on slender stems, and a steady producer of baby plantlets at the base you can pot up and share. Bright indirect light, let it dry out between waterings.",
    categorySlug: "plants",
    tiers: [{ size: "small-4in", label: "Small (4\" pot)", priceCents: 1600 }],
    image: {
      url: "https://loremflickr.com/800/600/pilea,houseplant?lock=1",
      alt: "A Chinese money plant with round coin-shaped leaves on slender stems",
    },
  },
  {
    slug: "calathea-orbifolia",
    title: "Calathea Orbifolia",
    description:
      "Broad, round leaves striped in silver and deep green that fold up at night and open again by morning. Wants bright indirect light, steady humidity, and soil that never fully dries out.",
    categorySlug: "plants",
    tiers: [{ size: "medium-6in", label: "Medium (6\" pot)", priceCents: 2800 }],
    image: {
      url: "https://loremflickr.com/800/600/calathea,houseplant?lock=1",
      alt: "A calathea plant with broad leaves striped in silver and deep green",
    },
  },
  {
    slug: "string-of-pearls",
    title: "String of Pearls",
    description:
      "Senecio rowleyanus, a trailing succulent whose stems are strung with tiny bead-like leaves. Best in a hanging planter or high shelf where the strands can cascade; bright light and infrequent deep watering keep it plump.",
    categorySlug: "plants",
    tiers: [{ size: "hanging-6in", label: "Hanging (6\" pot)", priceCents: 2200 }],
    image: {
      url: "https://loremflickr.com/800/600/string-of-pearls,succulent?lock=1",
      alt: "A string of pearls succulent trailing from a hanging planter",
    },
  },
  {
    slug: "rubber-plant",
    title: "Burgundy Rubber Plant",
    description:
      "Ficus elastica 'Burgundy', broad glossy leaves in deep wine-red that catch the light. A sturdy, upright statement plant for a bright corner -- wipe the leaves occasionally and it keeps pushing out new growth.",
    categorySlug: "plants",
    tiers: [{ size: "large-10in", label: "Large (10\" pot)", priceCents: 4400, stockUnits: 9 }],
    image: {
      url: "https://loremflickr.com/800/600/rubber-plant,houseplant?lock=1",
      alt: "A burgundy rubber plant with broad glossy wine-red leaves",
    },
  },

  // -- Ceramics & Planters (additional forms) ------------------------------
  {
    slug: "bud-vase-trio",
    title: "Bud Vase Trio",
    description:
      "Three small hand-thrown bud vases in complementary glazes -- matte white, warm speckle, and soft sage. Each holds a single stem or a short handful; grouped together on a windowsill or strung along a mantel.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "set-of-3", label: "Set of 3", priceCents: 2800 }],
    image: {
      url: "https://loremflickr.com/800/600/bud-vase,ceramic?lock=1",
      alt: "Three small hand-thrown ceramic bud vases in complementary glazes",
    },
  },
  {
    slug: "reactive-glaze-serving-bowl",
    title: "Reactive-Glaze Serving Bowl",
    description:
      "A hand-thrown stoneware serving bowl finished in a drippy reactive glaze that breaks to a different pattern with every firing -- no two bowls glazed alike. Equally at home holding salad or fruit on the counter.",
    categorySlug: "ceramics-planters",
    tiers: [
      { size: "small-8in", label: "Small (8\")", priceCents: 3200 },
      { size: "large-11in", label: "Large (11\")", priceCents: 4800, stockUnits: 10 },
    ],
    image: {
      url: "https://loremflickr.com/800/600/ceramic-bowl,pottery?lock=1",
      alt: "A hand-thrown stoneware serving bowl with a drippy reactive glaze",
    },
  },
  {
    slug: "terracotta-hanging-planter",
    title: "Terracotta Hanging Planter",
    description:
      "Unglazed terracotta planter with three pre-drilled holes for macrame rope (sold separately) and a built-in drainage hole. The bare clay develops a soft patina over time as it wicks moisture.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "6in", label: "6-inch", priceCents: 2400 }],
    image: {
      url: "https://loremflickr.com/800/600/terracotta,planter?lock=1",
      alt: "An unglazed terracotta hanging planter with a drainage hole",
    },
  },
  {
    slug: "carved-stoneware-vase",
    title: "Carved Stoneware Vase",
    description:
      "A tall stoneware vase, hand-carved with a fine vertical fluting pattern before glazing in a matte charcoal finish. Each groove is cut by hand, so the spacing carries the slight irregularity of real handwork.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "12in", label: "12-inch", priceCents: 5200, stockUnits: 7 }],
    image: {
      url: "https://loremflickr.com/800/600/stoneware-vase,pottery?lock=1",
      alt: "A tall hand-carved stoneware vase with vertical fluting in a matte charcoal finish",
    },
  },
  {
    slug: "ceramic-trinket-dish-set",
    title: "Ceramic Trinket Dish Set",
    description:
      "Two small ceramic trinket dishes -- one for the nightstand, one for the entryway catch-all. Glazed in a soft two-tone finish with an unglazed matte-clay rim.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "set-of-2", label: "Set of 2", priceCents: 2200 }],
    image: {
      url: "https://loremflickr.com/800/600/trinket-dish,ceramic?lock=1",
      alt: "Two small ceramic trinket dishes in a soft two-tone glaze",
    },
  },

  // -- Textiles & Fiber Arts (additional techniques) -----------------------
  {
    slug: "woven-cotton-table-runner",
    title: "Woven Cotton Table Runner",
    description:
      "Hand-woven on a floor loom from cotton in a striped warp pattern, finished with a hand-twisted fringe at each end. Reversible, machine washable on cold.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "14x72in", label: "14 x 72 in", priceCents: 3800 }],
    image: {
      url: "https://loremflickr.com/800/600/table-runner,weaving?lock=1",
      alt: "A hand-woven striped cotton table runner with a hand-twisted fringe",
    },
  },
  {
    slug: "handwoven-market-basket",
    title: "Hand-Woven Market Basket",
    description:
      "A sturdy market basket hand-woven from seagrass over a wire frame, with reinforced leather handles. Roomy enough for a farmers-market haul or a rolled-up throw blanket by the couch.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "medium", label: "Medium", priceCents: 4600 }],
    image: {
      url: "https://loremflickr.com/800/600/woven-basket,basket?lock=1",
      alt: "A hand-woven seagrass market basket with reinforced leather handles",
    },
  },
  {
    slug: "macrame-plant-hanger",
    title: "Macrame Plant Hanger",
    description:
      "Hand-knotted from natural cotton cord in a classic diamond pattern. The single-pot version fits a standard 6-inch pot; the double-tier version hangs two pots at staggered heights on one mount.",
    categorySlug: "textiles-fiber-arts",
    tiers: [
      { size: "single-pot", label: "Single-pot", priceCents: 2400 },
      { size: "double-tier", label: "Double-tier", priceCents: 3800 },
    ],
    image: {
      url: "https://loremflickr.com/800/600/macrame,plant-hanger?lock=1",
      alt: "A hand-knotted macrame plant hanger in a classic diamond pattern",
    },
  },
  {
    slug: "block-printed-linen-napkins",
    title: "Block-Printed Linen Napkins",
    description:
      "A set of four linen napkins, hand block-printed with a repeating botanical motif using hand-carved wood blocks. Each napkin varies slightly in ink saturation and register, the mark of a hand press.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "set-of-4", label: "Set of 4", priceCents: 3400 }],
    image: {
      url: "https://loremflickr.com/800/600/linen-napkin,block-print?lock=1",
      alt: "A set of block-printed linen napkins with a repeating botanical motif",
    },
  },

  // -- Paper & Ephemera (additional formats) -------------------------------
  {
    slug: "wrapping-paper-set",
    title: "Botanical Wrapping Paper Set",
    description:
      "Three rolls of wrapping paper in coordinating hand-drawn botanical prints, screen-printed on uncoated kraft stock. The reversible plain-kraft backing doubles as a fourth pattern.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-3", label: "Set of 3 rolls", priceCents: 1800, stockUnits: 24 }],
    image: {
      url: "https://loremflickr.com/800/600/wrapping-paper,botanical-print?lock=1",
      alt: "Rolls of wrapping paper in coordinating hand-drawn botanical prints",
    },
  },
  {
    slug: "pressed-botanical-bookmarks",
    title: "Pressed Botanical Bookmarks",
    description:
      "A set of five bookmarks, each laminated around a real pressed flower or leaf gathered and pressed by hand. No two sets are exactly alike.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-5", label: "Set of 5", priceCents: 1600, stockUnits: 20 }],
    image: {
      url: "https://loremflickr.com/800/600/pressed-flower,bookmark?lock=1",
      alt: "A set of bookmarks each laminated around a real pressed flower or leaf",
    },
  },
  {
    slug: "letterpress-stationery-set",
    title: "Letterpress Stationery Set",
    description:
      "A boxed correspondence set of twelve lined notecards, letterpress-printed with a simple botanical header and paired with matching kraft envelopes. Built for actual letters, not just blank greeting cards.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-12", label: "Set of 12", priceCents: 3200, stockUnits: 18 }],
    image: {
      url: "https://loremflickr.com/800/600/letterpress,stationery?lock=1",
      alt: "A boxed letterpress stationery set with lined notecards and kraft envelopes",
    },
  },
  {
    slug: "seed-paper-gift-tags",
    title: "Seed Paper Gift Tags",
    description:
      "A set of twelve gift tags made from real seed-embedded paper -- plant the tag after the gift is opened and wildflowers grow. Kraft twine included for tying onto packages.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-12", label: "Set of 12", priceCents: 1400, stockUnits: 30 }],
    image: {
      url: "https://loremflickr.com/800/600/gift-tag,paper?lock=1",
      alt: "A set of gift tags made from real seed-embedded paper with kraft twine",
    },
  },

  // -- Candles & Home Fragrance ---------------------------------------------
  {
    slug: "fig-cedar-soy-candle",
    title: "Fig & Cedar Soy Candle",
    description:
      "A small-batch soy candle in fig and cedar, hand-poured into reusable vessels with a cotton wick. Roughly 40 hours of burn time in the standard jar, 15 in the travel tin.",
    categorySlug: "candles-home-fragrance",
    tiers: [
      { size: "travel-tin", label: "Travel Tin", priceCents: 1400 },
      { size: "standard-jar", label: "Standard Jar", priceCents: 2800 },
    ],
    image: {
      url: "https://loremflickr.com/800/600/candle,soy-candle?lock=1",
      alt: "A small-batch soy candle hand-poured into a reusable jar with a cotton wick",
    },
  },
  {
    slug: "botanical-room-spray",
    title: "Botanical Room Spray",
    description:
      "A linen and room spray blended from essential oils in eucalyptus and mint, bottled in a reusable amber glass mister. A quick way to freshen a room without lighting anything.",
    categorySlug: "candles-home-fragrance",
    tiers: [{ size: "4oz", label: "4 oz", priceCents: 1800 }],
    image: {
      url: "https://loremflickr.com/800/600/room-spray,glass-bottle?lock=1",
      alt: "A linen and room spray bottled in a reusable amber glass mister",
    },
  },
  {
    slug: "beeswax-taper-candles",
    title: "Beeswax Taper Candles",
    description:
      "A pair of hand-dipped beeswax taper candles in natural honey-gold, made the old way -- dipped by hand, one layer at a time, until each taper reaches full thickness. Clean-burning with a faint honey scent.",
    categorySlug: "candles-home-fragrance",
    tiers: [{ size: "pair", label: "Pair", priceCents: 1600, stockUnits: 10 }],
    image: {
      url: "https://loremflickr.com/800/600/taper-candle,beeswax?lock=1",
      alt: "A pair of hand-dipped beeswax taper candles in natural honey-gold",
    },
  },
];

/**
 * real-store-depth epic: seeds DEMO_SUBCATEGORIES (above) as real child
 * categories under their real parent, then additionally assigns each
 * listed real product to its real subcategory -- on top of, never instead
 * of, that product's existing top-level assignment from the main product
 * loop in seedBroadleafDemo. A subcategory whose parentSlug doesn't
 * resolve (shouldn't happen -- DEMO_CATEGORIES always seeds first) is
 * silently skipped, same defensive shape as the top-level category lookup
 * in the main product loop below.
 */
async function seedSubcategories(
  marketingCatalog: MarketingCatalogService,
  categoryIdBySlug: Map<string, string>,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  for (const subcategory of DEMO_SUBCATEGORIES) {
    const parentId = categoryIdBySlug.get(subcategory.parentSlug);
    if (!parentId) continue;

    const created = await marketingCatalog.createCategory({
      slug: subcategory.slug,
      title: subcategory.title,
      description: subcategory.description,
      parentId,
    });

    for (const productSlug of subcategory.productSlugs) {
      const productId = productIdBySlug.get(productSlug);
      if (productId) await marketingCatalog.assignProductToCategory(productId, created.id);
    }
  }
}

/**
 * real-store-depth epic: the one real, redeemable BLOOM_PROMO_CODE coupon
 * (see its own doc comment above) -- cart-scope, percentage-off,
 * targetSkuIds empty (a cart-wide discount, not restricted to specific
 * SKUs), no minimum/expiry/usage-limit gates. Mirrors
 * CreatePromotionInput's real shape from @mercatus-liber/promotions.
 */
async function seedPromotions(promotions: PromotionsService): Promise<void> {
  await promotions.createPromotion({
    code: BLOOM_PROMO_CODE,
    kind: "percentage",
    scope: "cart",
    value: BLOOM_PROMO_PERCENT_OFF,
    currency: "USD",
    targetSkuIds: [],
    minCartAmount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
  });
}

/**
 * real-store-depth epic: one real "starter kit" Bundle attached to the
 * Trailing Pothos's small (4") SKU, with 3 real CUMULATIVE tiers --
 * mirrors lib/seed.ts's seedServiceBundle pattern exactly (tier N's
 * skuIds always contains tier N-1's skuIds plus one more real SKU). Tier 1
 * is the plant alone; tier 2 adds the Speckled Ceramic Planter it ships
 * best in; tier 3 adds a Fig & Cedar Soy Candle (travel tin) as a real
 * small gift-with-purchase add-on. `skuIdByProductAndSize` is populated by
 * the main product loop in seedBroadleafDemo below, keyed
 * "<product slug>::<tier size>".
 */
async function seedStarterBundle(
  bundles: BundlesService,
  productIdBySlug: Map<string, string>,
  skuIdByProductAndSize: Map<string, string>,
): Promise<void> {
  const pothosProductId = productIdBySlug.get("trailing-pothos");
  const pothosSmallSkuId = skuIdByProductAndSize.get("trailing-pothos::small-4in");
  const planterSkuId = skuIdByProductAndSize.get("speckled-ceramic-planter::6in");
  const candleSkuId = skuIdByProductAndSize.get("fig-cedar-soy-candle::travel-tin");
  if (!pothosProductId || !pothosSmallSkuId || !planterSkuId || !candleSkuId) return;

  await bundles.createBundle({
    productId: pothosProductId,
    title: "Trailing Pothos Starter Kit",
    tiers: [
      { id: randomUUID(), label: "Plant Only", skuIds: [pothosSmallSkuId] },
      { id: randomUUID(), label: "+ Speckled Ceramic Planter", skuIds: [pothosSmallSkuId, planterSkuId] },
      {
        id: randomUUID(),
        label: "+ Fig & Cedar Candle (Travel Tin)",
        skuIds: [pothosSmallSkuId, planterSkuId, candleSkuId],
      },
    ],
  });
}

/**
 * real-store-depth epic: 2 real, curated cross-sell pairings between
 * products already in DEMO_PRODUCTS -- placement "both" so each satisfies
 * both the PDP and cart resolution paths (see
 * components/recommendation-shelf.tsx), mirroring lib/seed.ts's
 * seedRecommendations exactly.
 */
async function seedRecommendations(
  recommendations: RecommendationsService,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  const monsteraId = productIdBySlug.get("monstera-deliciosa");
  const planterId = productIdBySlug.get("speckled-ceramic-planter");
  if (monsteraId && planterId) {
    await recommendations.createRule({
      sourceProductId: monsteraId,
      label: "Pairs well with",
      placement: "both",
      targetProductIds: [planterId],
    });
  }

  const candleId = productIdBySlug.get("fig-cedar-soy-candle");
  const printId = productIdBySlug.get("botanical-print");
  if (candleId && printId) {
    await recommendations.createRule({
      sourceProductId: candleId,
      label: "Customers also bought",
      placement: "both",
      targetProductIds: [printId],
    });
  }
}

/**
 * real-store-depth epic: one real, untargeted, active Campaign whose
 * creative copy references the real, redeemable BLOOM_PROMO_CODE seeded by
 * seedPromotions above -- never advertises a discount that isn't backed by
 * a real code. Mirrors lib/seed.ts's seedAdvertising shape (2 creatives,
 * weighted-random rotation). Resolved on the home page via the "ad-slot"
 * CMS section seedBroadleafDemo adds to the home page's sections below.
 */
async function seedMarketingCampaign(advertising: AdvertisingService): Promise<void> {
  await advertising.createCampaign({
    name: "Broadleaf Bloom Sale",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: null, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: `Save ${BLOOM_PROMO_PERCENT_OFF}% -- Enter Code ${BLOOM_PROMO_CODE}`,
        body: `Enter code ${BLOOM_PROMO_CODE} at checkout to save ${BLOOM_PROMO_PERCENT_OFF}% on your order -- plants, ceramics, textiles, paper goods, and candles, all included.`,
        imageUrl: null,
        linkHref: "/demo/broadleaf/category/plants",
        weight: 1,
      },
      {
        id: randomUUID(),
        headline: "New: Trailing Pothos Starter Kit",
        body: "Bundle a Trailing Pothos with a hand-thrown planter and a Fig & Cedar candle -- everything you need in one order.",
        imageUrl: null,
        linkHref: "/demo/broadleaf/products/trailing-pothos",
        weight: 1,
      },
    ],
  });
}

/**
 * reviews epic (package commit 3370c16, UI commit 0cdd2e7): real, varied
 * review content for a representative spread of Broadleaf's real products
 * -- one plant per plant subcategory (Trailing Pothos for easy-care,
 * Monstera Deliciosa for statement), the planter it's recommended to ship
 * in (speckled-ceramic-planter, see seedStarterBundle above), one textile,
 * one paper good, and the candle already advertised on the home page --
 * spanning all 5 top-level DEMO_CATEGORIES so every category has real
 * reviewable content, weighted toward the products most likely to get
 * clicked in a demo walkthrough.
 *
 * Ratings are a real, honest mix, not a wall of 5 stars -- Marcus Webb,
 * Renata Voss, Ben Okafor, and Priya Anand leave fair 4-star reviews with
 * a specific, real nit, and Grace Lindqvist's and Diane Ostrowski's 3-star
 * reviews carry real, specific criticism (a glaze flaw, yellowed leaves
 * after a slow shipment) rather than vague complaints. Author names,
 * scents, glazes, and care notes all reference each product's own real
 * DEMO_PRODUCTS description above rather than generic praise.
 */
interface DemoReview {
  productSlug: string;
  rating: 1 | 2 | 3 | 4 | 5;
  authorName: string;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  /**
   * false leaves this review "pending" -- unmoderated -- on purpose, so
   * /admin/reviews's real moderation queue (Publish/Reject actions) has
   * real, visible work to demonstrate rather than an empty inbox. Exactly
   * 3 of the reviews below are left pending; every other one is published
   * immediately by seedReviews below.
   */
  publish: boolean;
}

const DEMO_REVIEWS: DemoReview[] = [
  // -- Plants ---------------------------------------------------------------
  {
    productSlug: "trailing-pothos",
    rating: 5,
    authorName: "Sarah Chen",
    title: "Trailing beautifully over my kitchen shelf already",
    body: "Bought the medium 6-inch pot for a floating shelf above my sink and it's already sending out new vines after three weeks. Heart-shaped leaves have great variegation, more cream than I expected in a good way. Forgives me forgetting to water it on busy weeks, exactly as advertised.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "trailing-pothos",
    rating: 4,
    authorName: "Marcus Webb",
    title: "Healthy plant, but the small pot is genuinely small",
    body: "The small 4-inch pot arrived healthy with no damaged leaves, but it's more of a rooted cutting than a mature trailing plant -- if you're picturing a full vine out of the box, size up to the medium. Two months later it's filled in nicely and I'm happy with it.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "trailing-pothos",
    rating: 3,
    authorName: "Diane Ostrowski",
    title: "Arrived a little worse for wear, but recovering",
    body: "Two leaves had yellowed and the soil was bone dry when it arrived, which makes me think it sat in a warehouse or truck longer than it should have. I trimmed the yellow leaves and gave it a good soak, and two weeks in it looks like it's turned the corner. Wanted to leave an honest review of the unboxing experience rather than just the plant itself.",
    verifiedPurchase: true,
    publish: false,
  },
  {
    productSlug: "monstera-deliciosa",
    rating: 5,
    authorName: "Jordan Ashby",
    title: "Already splitting on the newest leaf",
    body: "Ordered the large 10-inch and it showed up with a sturdy, well-shaped stem instead of the leggy single-vine look I've gotten from other online plant orders. Put my own moss pole behind it the day it arrived and it's already gripping on and pushing a new leaf with visible fenestration starting.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "monstera-deliciosa",
    rating: 4,
    authorName: "Renata Voss",
    title: "Gorgeous plant, one small shipping ding",
    body: "The medium 6-inch Monstera is beautiful and clearly well cared-for before it shipped, but one of the larger leaves had a small tear along the edge, probably from shifting in the box. Doesn't affect the plant's health and new growth already looks perfect -- just mentioning it for anyone who wants a flawless first impression.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "monstera-deliciosa",
    rating: 5,
    authorName: "Tobias Lund",
    title: "Fast grower, worth the price",
    body: "Picked this up as a gift for my partner's office and had it shipped straight there, so I haven't seen it in person, but she sends me a photo of a new leaf every couple of weeks now. Sounds like exactly the vigorous grower the listing promised.",
    verifiedPurchase: false,
    publish: false,
  },

  // -- Ceramics & Planters ----------------------------------------------------
  {
    productSlug: "speckled-ceramic-planter",
    rating: 5,
    authorName: "Helen Ruiz",
    title: "The speckle glaze is even better in person",
    body: "I've bought a lot of mass-produced planters trying to get this warm, freckled stoneware look and none of them came close. The drainage hole and matching saucer are both genuinely functional, not just decorative, and mine has a lovely uneven glaze pool near the base that makes it obviously handmade.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "speckled-ceramic-planter",
    rating: 3,
    authorName: "Grace Lindqvist",
    title: "Beautiful piece, but one edge had a small glaze flaw",
    body: "The color and shape are exactly what I wanted for my pothos, and I understand each piece is thrown individually so some variation is expected. That said, there's a small rough patch along one edge where the glaze didn't fully cover, and for the price I was hoping for a bit more consistency. Still using it, just being honest.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "speckled-ceramic-planter",
    rating: 4,
    authorName: "Wen Zhao",
    title: "Sturdy and well-packed",
    body: "Arrived wrapped in about four layers of packing paper with zero chips, which after a couple of pottery-in-the-mail horror stories from other shops was a relief. Glaze reads a touch more brown than the product photo suggested, but it's a good honest stoneware planter and it's already got my snake plant in it.",
    verifiedPurchase: true,
    publish: false,
  },

  // -- Textiles & Fiber Arts --------------------------------------------------
  {
    productSlug: "handwoven-wall-hanging",
    rating: 5,
    authorName: "Odalys Ferreira",
    title: "Centerpiece of my reading nook now",
    body: "The cream and rust tones are richer in person than the photos show, and the driftwood dowel gives it real weight and presence on the wall instead of looking flimsy. You can see the weaving technique change across the piece, which makes it feel like a genuine handmade textile instead of a mass-produced tapestry.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "handwoven-wall-hanging",
    rating: 4,
    authorName: "Ben Okafor",
    title: "Lovely weave, ships a bit wrinkled",
    body: "Weaving quality is excellent and the rust tones pop against my white wall exactly like I hoped. It did arrive a little creased from being folded in the shipping box, and it took about two days hanging before the fibers relaxed and fell naturally. Worth the wait.",
    verifiedPurchase: true,
    publish: true,
  },

  // -- Paper & Ephemera ---------------------------------------------------------
  {
    productSlug: "botanical-print",
    rating: 5,
    authorName: "Camille Duarte",
    title: "Framed it and it looks like an antique botanical study",
    body: "The ink linework is crisp and the cotton paper has a nice soft texture you can actually feel, not just see. It arrived perfectly flat in a rigid mailer like promised, no creases or corner dings, and slid straight into a standard 11x14 frame without trimming.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "botanical-print",
    rating: 5,
    authorName: "Aaron Micklewait",
    title: "Gift that got immediately hung on the wall",
    body: "Ordered this for my mother-in-law, who's into botanical illustration, and she had it framed within the week. Print quality holds up close -- the fine linework doesn't look dotted or pixelated the way some giclee prints do.",
    verifiedPurchase: false,
    publish: true,
  },

  // -- Candles & Home Fragrance -------------------------------------------------
  {
    productSlug: "fig-cedar-soy-candle",
    rating: 5,
    authorName: "Nadia Solberg",
    title: "Fig and cedar without being overpowering",
    body: "Got the standard jar and it burns clean with barely any soot on the glass, and the cotton wick stays centered the whole way down. Fig comes through first and the cedar settles in underneath once it's been burning a while -- not one of those candles that just smells like air freshener.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "fig-cedar-soy-candle",
    rating: 4,
    authorName: "Priya Anand",
    title: "Great scent, burn time ran a little short",
    body: "The scent throw is genuinely good, fills my living room without being cloying, and the fig-cedar combo is unusual in the best way. My standard jar burned closer to 32 hours than the roughly 40 hours listed, though I may have let the wax pool unevenly on the first burn, which I know affects total burn time.",
    verifiedPurchase: true,
    publish: true,
  },
  {
    productSlug: "fig-cedar-soy-candle",
    rating: 5,
    authorName: "Levi Fitzgerald",
    title: "Perfect travel tin for a weekend away",
    body: "Bought the travel tin for a cabin trip and it filled a small room easily in about twenty minutes. The cedar note is stronger in the tin than I expected from the description, which I liked -- reads a little more woodsy than the standard jar.",
    verifiedPurchase: true,
    publish: true,
  },
];

/**
 * reviews epic: submits every DEMO_REVIEWS entry via the real
 * reviews.submitReview path (each lands "pending", exactly like a real
 * shopper's submission), then immediately reviews.moderateReview(...,
 * "published") for every entry except the 3 marked `publish: false` above,
 * which are left pending on purpose so /admin/reviews's real moderation
 * queue has real work to show. A productSlug that doesn't resolve in
 * productIdBySlug (shouldn't happen -- DEMO_REVIEWS only references real
 * DEMO_PRODUCTS slugs seeded earlier in seedBroadleafDemo) is silently
 * skipped, same defensive shape as the other seedX helpers above.
 */
async function seedReviews(reviews: ReviewsService, productIdBySlug: Map<string, string>): Promise<void> {
  for (const demo of DEMO_REVIEWS) {
    const productId = productIdBySlug.get(demo.productSlug);
    if (!productId) continue;

    const review = await reviews.submitReview({
      productId,
      rating: demo.rating,
      authorName: demo.authorName,
      title: demo.title,
      body: demo.body,
      verifiedPurchase: demo.verifiedPurchase,
    });

    if (demo.publish) await reviews.moderateReview(review.id, "published");
  }
}

export async function seedBroadleafDemo(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
  promotions?: PromotionsService,
  bundles?: BundlesService,
  recommendations?: RecommendationsService,
  advertising?: AdvertisingService,
  reviews?: ReviewsService,
): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();
  for (const category of DEMO_CATEGORIES) {
    const created = await marketingCatalog.createCategory({
      slug: category.slug,
      title: category.title,
      description: category.description,
      parentId: null,
    });
    categoryIdBySlug.set(category.slug, created.id);
  }

  const productIdBySlug = new Map<string, string>();
  // "<product slug>::<tier size>" -> that tier's real SKU id -- populated
  // below as each tier's single-value generateSkus call resolves, read by
  // seedStarterBundle above to build the Trailing Pothos Starter Kit's
  // cumulative tiers out of real SKUs rather than fabricated ids.
  const skuIdByProductAndSize = new Map<string, string>();
  for (const demo of DEMO_PRODUCTS) {
    const product = await catalog.createProduct({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      identifyingAttributeKeys: ["size"],
      images: [demo.image],
    });
    productIdBySlug.set(demo.slug, product.id);
    await catalog.publishProduct(product.id);

    for (const tier of demo.tiers) {
      const skus = await catalog.generateSkus(product.id, { size: [tier.size] }, { amount: tier.priceCents, currency: "USD" });
      for (const sku of skus) {
        await inventory.setStock(sku.id, tier.stockUnits ?? DEFAULT_STOCK_UNITS);
        skuIdByProductAndSize.set(`${demo.slug}::${tier.size}`, sku.id);
      }
    }

    const categoryId = categoryIdBySlug.get(demo.categorySlug);
    if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
  }

  await seedSubcategories(marketingCatalog, categoryIdBySlug, productIdBySlug);

  // Slug MUST be "home" -- app/page.tsx looks up a fixed "home" slug
  // regardless of which brand's seed is active (each seed runs against its
  // own fresh in-memory DB, so there's no collision between brands). See
  // lib/seed-northline.ts's identical comment.
  const home = await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Broadleaf & Co.",
    sections: [
      {
        componentType: "hero-banner",
        config: {
          headline: "Broadleaf & Co.",
          subheadline: "Small-batch plants, ceramics, textiles, and paper goods -- handmade, hand-thrown, and hand-woven.",
        },
      },
      {
        componentType: "product-grid",
        // A representative spread across all 5 categories, not every
        // product -- one plant (the tiered Trailing Pothos), one ceramic,
        // one textile, one paper good, one candle (the newest category, so
        // it gets a showcase slot too).
        config: {
          productIds: [
            productIdBySlug.get("trailing-pothos"),
            productIdBySlug.get("speckled-ceramic-planter"),
            productIdBySlug.get("handwoven-wall-hanging"),
            productIdBySlug.get("letterpress-card-set"),
            productIdBySlug.get("fig-cedar-soy-candle"),
          ].filter((id): id is string => Boolean(id)),
        },
      },
      {
        // real-store-depth epic: renders via components/cms-sections.tsx's
        // AdSlot, resolved against pageSlug="home" (see
        // components/home-standard-grid.tsx) -- picks up the untargeted
        // "Broadleaf Bloom Sale" campaign seeded by seedMarketingCampaign
        // below when `advertising` is provided; renders nothing otherwise
        // (AdSlot's own documented no-op behavior).
        componentType: "ad-slot",
        config: {},
      },
    ],
  });
  await cms.publishPage(home.id);

  if (promotions) await seedPromotions(promotions);
  if (bundles) await seedStarterBundle(bundles, productIdBySlug, skuIdByProductAndSize);
  if (recommendations) await seedRecommendations(recommendations, productIdBySlug);
  if (advertising) await seedMarketingCampaign(advertising);
  if (reviews) await seedReviews(reviews, productIdBySlug);
}
