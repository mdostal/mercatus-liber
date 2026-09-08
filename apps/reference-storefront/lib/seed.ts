import type { CatalogService } from "@mercatus-liber/catalog";

interface DemoProduct {
  slug: string;
  title: string;
  description: string;
  color: string;
  size: string;
  priceCents: number;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A dragon-branded, multi-color 3D-printed cable organizer.",
    color: "red",
    size: "large",
    priceCents: 1999,
  },
  {
    slug: "dragon-desk-mat",
    title: "Dragon Desk Mat",
    description: "A dragon-branded desk mat.",
    color: "black",
    size: "medium",
    priceCents: 2999,
  },
];

/** Seeds a handful of demo products/SKUs, published (active) so they're immediately purchasable. */
export async function seedCatalog(catalog: CatalogService): Promise<void> {
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
  }
}
