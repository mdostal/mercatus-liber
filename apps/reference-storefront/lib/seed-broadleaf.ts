import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
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
 * Inventory (subsystem 11) is intentionally not seeded, same as
 * seed-northline.ts: the reserve/commit/release model exists for stocked
 * SKUs, but "never throws, oversell allowed by default" means checkout
 * still works fine for a SKU with no explicit stock record.
 */

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
];

/** One priced tier of a variant product (mirrors lib/seed-northline.ts's ServiceTier -- one generateSkus call per tier so each tier can carry its own distinct price). */
interface ProductTier {
  size: string;
  label: string;
  priceCents: number;
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
  },
  {
    slug: "snake-plant",
    title: "Snake Plant",
    description:
      "Dracaena trifasciata, stiff upright leaves banded in deep green and silver-gray. One of the most forgiving houseplants there is -- happy in low light and comfortable going weeks between waterings.",
    categorySlug: "plants",
    tiers: [{ size: "medium-6in", label: "Medium (6\" pot)", priceCents: 2200 }],
  },
  {
    slug: "fiddle-leaf-fig",
    title: "Fiddle Leaf Fig",
    description:
      "Ficus lyrata, the statement floor plant with broad, glossy violin-shaped leaves. Wants bright indirect light and a consistent spot -- it does not love being moved around.",
    categorySlug: "plants",
    tiers: [{ size: "large-10in", label: "Large (10\" pot)", priceCents: 4800 }],
  },
  {
    slug: "speckled-ceramic-planter",
    title: "Speckled Ceramic Planter",
    description:
      "A hand-thrown stoneware planter finished in a warm speckled glaze, with a drainage hole and matching saucer. Each piece is thrown individually, so glaze pooling varies slightly from one to the next.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "6in", label: "6-inch", priceCents: 3400 }],
  },
  {
    slug: "stoneware-mug-set",
    title: "Hand-Thrown Stoneware Mug Set",
    description:
      "A set of two hand-thrown 12oz stoneware mugs in a matte reactive glaze. Microwave- and dishwasher-safe, no two mugs glazed exactly alike.",
    categorySlug: "ceramics-planters",
    tiers: [{ size: "set-of-2", label: "Set of 2", priceCents: 4200 }],
  },
  {
    slug: "handwoven-wall-hanging",
    title: "Hand-Woven Wall Hanging",
    description:
      "A wall hanging hand-woven on a floor loom from natural cotton and wool roving in cream and rust tones, finished with a driftwood dowel.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "24x36in", label: "24 x 36 in", priceCents: 8800 }],
  },
  {
    slug: "chunky-knit-throw",
    title: "Chunky Knit Throw Blanket",
    description:
      "A hand-knit throw blanket worked in a super-bulky merino wool blend for a soft, oversized-stitch texture. Warm enough for a couch on a cold night, light enough for year-round use.",
    categorySlug: "textiles-fiber-arts",
    tiers: [{ size: "50x60in", label: "50 x 60 in", priceCents: 12800 }],
  },
  {
    slug: "letterpress-card-set",
    title: "Letterpress Card Set",
    description:
      "A set of eight letterpress-printed cards on heavyweight cotton paper, each hand-fed through a vintage platen press. Blank inside, kraft envelopes included.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "set-of-8", label: "Set of 8", priceCents: 2400 }],
  },
  {
    slug: "botanical-print",
    title: "Botanical Print",
    description:
      "An archival giclee print of an original ink botanical study, printed on heavyweight matte cotton paper. Ships flat in a rigid mailer, ready to frame.",
    categorySlug: "paper-ephemera",
    tiers: [{ size: "11x14in", label: "11 x 14 in", priceCents: 2800 }],
  },
];

export async function seedBroadleafDemo(catalog: CatalogService, marketingCatalog: MarketingCatalogService, cms: CmsService): Promise<void> {
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
    });
    productIdBySlug.set(demo.slug, product.id);
    await catalog.publishProduct(product.id);

    for (const tier of demo.tiers) {
      await catalog.generateSkus(product.id, { size: [tier.size] }, { amount: tier.priceCents, currency: "USD" });
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
        // A representative spread across all 4 categories, not every
        // product -- one plant (the tiered Trailing Pothos), one ceramic,
        // one textile, one paper good.
        config: {
          productIds: [
            productIdBySlug.get("trailing-pothos"),
            productIdBySlug.get("speckled-ceramic-planter"),
            productIdBySlug.get("handwoven-wall-hanging"),
            productIdBySlug.get("letterpress-card-set"),
          ].filter((id): id is string => Boolean(id)),
        },
      },
    ],
  });
  await cms.publishPage(home.id);
}
