import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";

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

export async function seedBroadleafDemo(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
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
      }
    }

    const categoryId = categoryIdBySlug.get(demo.categorySlug);
    if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
  }

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
    ],
  });
  await cms.publishPage(home.id);
}
