import type { CatalogService } from "@mercatus-liber/catalog";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";

interface DemoProduct {
  slug: string;
  title: string;
  description: string;
  color: string;
  size: string;
  priceCents: number;
  categorySlugs: string[];
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A dragon-branded, multi-color 3D-printed cable organizer.",
    color: "red",
    size: "large",
    priceCents: 1999,
    // Shared category ("desk-accessories") proves many-to-many assignment.
    categorySlugs: ["desk-accessories", "3d-printed"],
  },
  {
    slug: "dragon-desk-mat",
    title: "Dragon Desk Mat",
    description: "A dragon-branded desk mat.",
    color: "black",
    size: "medium",
    priceCents: 2999,
    categorySlugs: ["desk-accessories"],
  },
];

/** Seeds demo categories (top-level "Merch" with one child "Desk Accessories", plus a standalone "3D Printed"). */
async function seedCategories(marketingCatalog: MarketingCatalogService): Promise<Map<string, string>> {
  const merch = await marketingCatalog.createCategory({
    slug: "merch",
    title: "Merch",
    description: "Dragon-branded merch.",
    parentId: null,
  });
  const deskAccessories = await marketingCatalog.createCategory({
    slug: "desk-accessories",
    title: "Desk Accessories",
    description: "Things for your desk.",
    parentId: merch.id,
  });
  const printed3d = await marketingCatalog.createCategory({
    slug: "3d-printed",
    title: "3D Printed",
    description: "Anything that came off a printer.",
    parentId: null,
  });

  return new Map([
    [merch.slug, merch.id],
    [deskAccessories.slug, deskAccessories.id],
    [printed3d.slug, printed3d.id],
  ]);
}

/** Seeds a handful of demo products/SKUs (published/active) plus category assignments and marketing-catalog data. */
export async function seedCatalog(catalog: CatalogService, marketingCatalog: MarketingCatalogService): Promise<void> {
  const categoryIdBySlug = await seedCategories(marketingCatalog);

  for (const demo of DEMO_PRODUCTS) {
    const product = await catalog.createProduct({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      identifyingAttributeKeys: ["color", "size"],
    });
    await catalog.publishProduct(product.id);
    await catalog.generateSkus(
      product.id,
      { color: [demo.color], size: [demo.size] },
      { amount: demo.priceCents, currency: "USD" },
    );

    for (const categorySlug of demo.categorySlugs) {
      const categoryId = categoryIdBySlug.get(categorySlug);
      if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
    }
  }
}
