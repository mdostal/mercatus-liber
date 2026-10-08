import { describe, expect, it } from "vitest";
import { readAllProducts } from "../src/products.js";
import { createFakeGraphQLClient, type FakeProduct } from "./fake-graphql-client.js";

function simpleVariant(id: string, price: string, option: { name: string; value: string }): FakeProduct["variants"][number] {
  return {
    id,
    price,
    selectedOptions: [option],
    inventoryItemId: `${id}-inv`,
    inventoryLevels: [{ locationId: "loc-1", locationName: "Main Warehouse", onHand: 10, available: 10 }],
  };
}

describe("readAllProducts -- field mapping", () => {
  it("maps title, description, status, handle, and identifying attribute keys correctly for a single product and variant", async () => {
    const client = createFakeGraphQLClient({
      products: [
        {
          id: "gid://shopify/Product/1",
          handle: "dragon-cable-organizer",
          title: "Dragon Cable Organizer",
          descriptionHtml: "<p>A cable organizer.</p>",
          status: "ACTIVE",
          optionNames: ["Color"],
          variants: [simpleVariant("gid://shopify/ProductVariant/1", "19.99", { name: "Color", value: "Red" })],
        },
      ],
      collections: [],
    });

    const [imported] = await readAllProducts(client);

    expect(imported).toBeDefined();
    expect(imported?.product).toEqual({
      id: "gid://shopify/Product/1",
      slug: "dragon-cable-organizer",
      title: "Dragon Cable Organizer",
      description: "<p>A cable organizer.</p>",
      identifyingAttributeKeys: ["color"],
      status: "active",
    });
    expect(imported?.variants).toHaveLength(1);
    expect(imported?.variants[0]?.sku).toEqual({
      id: "gid://shopify/ProductVariant/1",
      productId: "gid://shopify/Product/1",
      identifyingAttributes: [{ key: "color", value: "Red" }],
      price: { amount: 1999, currency: "USD" },
      status: "active",
    });
  });

  it("resolves the caller-assigned id from the external_id metafield when present, rather than Shopify's own GID", async () => {
    const client = createFakeGraphQLClient({
      products: [
        {
          id: "gid://shopify/Product/1",
          handle: "dragon-cable-organizer",
          title: "Dragon Cable Organizer",
          descriptionHtml: "desc",
          status: "DRAFT",
          optionNames: ["Color"],
          externalId: "p1",
          variants: [{ ...simpleVariant("gid://shopify/ProductVariant/1", "9.00", { name: "Color", value: "Blue" }), externalId: "s1" }],
        },
      ],
      collections: [],
    });

    const [imported] = await readAllProducts(client, { currency: "EUR" });

    expect(imported?.product.id).toBe("p1");
    expect(imported?.product.status).toBe("draft");
    expect(imported?.variants[0]?.sku.id).toBe("s1");
    expect(imported?.variants[0]?.sku.productId).toBe("p1");
    expect(imported?.variants[0]?.sku.price).toEqual({ amount: 900, currency: "EUR" });
  });
});

describe("readAllProducts -- a product with variants spanning two option dimensions (color and size)", () => {
  it("maps every color/size combination to the correct identifyingAttributes, matching how embroidered-performance-polo is modeled in this repo's own seed data", async () => {
    const colors = ["navy", "charcoal-heather"];
    const sizes = ["small", "medium", "large"];
    const priceByColor: Record<string, number> = { navy: 42, "charcoal-heather": 43 };

    const variants: FakeProduct["variants"] = [];
    let n = 1;
    for (const color of colors) {
      for (const size of sizes) {
        variants.push({
          id: `gid://shopify/ProductVariant/${n}`,
          price: priceByColor[color]!.toFixed(2),
          selectedOptions: [
            { name: "Color", value: color },
            { name: "Size", value: size },
          ],
          inventoryItemId: `gid://shopify/InventoryItem/${n}`,
          inventoryLevels: [{ locationId: "loc-1", locationName: "Main Warehouse", onHand: 20, available: 20 }],
        });
        n += 1;
      }
    }

    const client = createFakeGraphQLClient({
      products: [
        {
          id: "gid://shopify/Product/polo",
          handle: "embroidered-performance-polo",
          title: "Embroidered Performance Polo",
          descriptionHtml: "A moisture-wicking polo.",
          status: "ACTIVE",
          optionNames: ["Color", "Size"],
          variants,
        },
      ],
      collections: [],
    });

    const [imported] = await readAllProducts(client);

    expect(imported?.product.identifyingAttributeKeys).toEqual(["color", "size"]);
    expect(imported?.variants).toHaveLength(6);

    const navySmall = imported?.variants.find((v) => v.sku.identifyingAttributes.some((a) => a.value === "navy") && v.sku.identifyingAttributes.some((a) => a.value === "small"));
    expect(navySmall?.sku.identifyingAttributes).toEqual([
      { key: "color", value: "navy" },
      { key: "size", value: "small" },
    ]);
    expect(navySmall?.sku.price.amount).toBe(4200);

    const charcoalLarge = imported?.variants.find(
      (v) => v.sku.identifyingAttributes.some((a) => a.value === "charcoal-heather") && v.sku.identifyingAttributes.some((a) => a.value === "large"),
    );
    expect(charcoalLarge?.sku.identifyingAttributes).toEqual([
      { key: "color", value: "charcoal-heather" },
      { key: "size", value: "large" },
    ]);
    expect(charcoalLarge?.sku.price.amount).toBe(4300);

    // Every variant is genuinely distinct -- no two option combinations collapsed onto the same SKU.
    const uniqueCombos = new Set(imported?.variants.map((v) => v.sku.identifyingAttributes.map((a) => `${a.key}:${a.value}`).join("|")));
    expect(uniqueCombos.size).toBe(6);
  });
});

describe("readAllProducts -- real cursor pagination", () => {
  function product(id: string, handle: string): FakeProduct {
    return {
      id: `gid://shopify/Product/${id}`,
      handle,
      title: handle,
      descriptionHtml: "",
      status: "ACTIVE",
      optionNames: [],
      variants: [],
    };
  }

  it("follows a real two-page products response end to end, returning every product across both pages", async () => {
    const client = createFakeGraphQLClient({
      products: [product("1", "a"), product("2", "b"), product("3", "c")],
      collections: [],
    });

    const imported = await readAllProducts(client, { productsPageSize: 2 });

    expect(imported.map((p) => p.product.slug)).toEqual(["a", "b", "c"]);
  });

  it("paginates a single product's variants connection across two pages", async () => {
    const variants: FakeProduct["variants"] = [1, 2, 3].map((n) => ({
      id: `gid://shopify/ProductVariant/${n}`,
      price: "10.00",
      selectedOptions: [{ name: "Size", value: `size-${n}` }],
      inventoryItemId: `gid://shopify/InventoryItem/${n}`,
      inventoryLevels: [{ locationId: "loc-1", locationName: "Main", onHand: 1, available: 1 }],
    }));

    const client = createFakeGraphQLClient({
      products: [{ ...product("1", "multi-variant"), optionNames: ["Size"], variants }],
      collections: [],
    });

    const [imported] = await readAllProducts(client, { variantsPageSize: 2 });

    expect(imported?.variants).toHaveLength(3);
    expect(imported?.variants.map((v) => v.sku.identifyingAttributes[0]?.value)).toEqual(["size-1", "size-2", "size-3"]);
  });

  it("paginates a single variant's inventory-levels connection across two pages and still sums every location", async () => {
    const locations = [
      { locationId: "loc-1", locationName: "A", onHand: 5, available: 5 },
      { locationId: "loc-2", locationName: "B", onHand: 7, available: 7 },
      { locationId: "loc-3", locationName: "C", onHand: 3, available: 3 },
    ];

    const client = createFakeGraphQLClient({
      products: [
        {
          ...product("1", "multi-location"),
          variants: [
            {
              id: "gid://shopify/ProductVariant/1",
              price: "5.00",
              selectedOptions: [],
              inventoryItemId: "gid://shopify/InventoryItem/1",
              inventoryLevels: locations,
            },
          ],
        },
      ],
      collections: [],
    });

    const [imported] = await readAllProducts(client, { inventoryLevelsPageSize: 1 });
    const inventory = imported?.variants[0]?.inventory;

    expect(inventory?.locations).toHaveLength(3);
    expect(inventory?.onHand).toBe(15);
  });
});
