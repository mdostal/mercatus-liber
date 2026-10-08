import { describe, expect, it } from "vitest";
import { readShopifyCatalog } from "../src/read-catalog.js";
import { createFakeGraphQLClient } from "./fake-graphql-client.js";

describe("readShopifyCatalog", () => {
  it("reads products and collections together into one snapshot, writing nothing", async () => {
    const client = createFakeGraphQLClient({
      products: [
        {
          id: "gid://shopify/Product/1",
          handle: "dragon-cable-organizer",
          title: "Dragon Cable Organizer",
          descriptionHtml: "desc",
          status: "ACTIVE",
          optionNames: ["Color"],
          variants: [
            {
              id: "gid://shopify/ProductVariant/1",
              price: "19.99",
              selectedOptions: [{ name: "Color", value: "Red" }],
              inventoryItemId: "gid://shopify/InventoryItem/1",
              inventoryLevels: [{ locationId: "loc-1", locationName: "Main", onHand: 4, available: 4 }],
            },
          ],
        },
      ],
      collections: [
        {
          id: "gid://shopify/Collection/1",
          handle: "organizers",
          title: "Organizers",
          description: "",
          descriptionHtml: "",
          productHandles: ["dragon-cable-organizer"],
        },
      ],
    });

    const snapshot = await readShopifyCatalog(client);

    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.collections).toHaveLength(1);
    expect(snapshot.collections[0]?.productHandles).toEqual(["dragon-cable-organizer"]);
    expect(snapshot.products[0]?.variants[0]?.inventory.onHand).toBe(4);
  });
});
