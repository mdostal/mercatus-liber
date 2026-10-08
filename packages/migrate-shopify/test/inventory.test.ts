import { describe, expect, it } from "vitest";
import { summarizeInventory } from "../src/inventory.js";
import type { ShopifyInventoryLevelNode } from "../src/types.js";

describe("summarizeInventory", () => {
  it("sums on_hand across multiple real locations into a single native-model onHand value, without dropping the per-location detail", () => {
    const levels: ShopifyInventoryLevelNode[] = [
      {
        location: { id: "gid://shopify/Location/1", name: "Warehouse East" },
        quantities: [
          { name: "on_hand", quantity: 18 },
          { name: "available", quantity: 15 },
        ],
      },
      {
        location: { id: "gid://shopify/Location/2", name: "Warehouse West" },
        quantities: [
          { name: "on_hand", quantity: 7 },
          { name: "available", quantity: 7 },
        ],
      },
    ];

    const snapshot = summarizeInventory(levels);

    expect(snapshot.onHand).toBe(25);
    expect(snapshot.locations).toEqual([
      { locationId: "gid://shopify/Location/1", locationName: "Warehouse East", onHand: 18, available: 15 },
      { locationId: "gid://shopify/Location/2", locationName: "Warehouse West", onHand: 7, available: 7 },
    ]);
  });

  it("returns zero onHand and an empty breakdown for a variant stocked nowhere", () => {
    expect(summarizeInventory([])).toEqual({ onHand: 0, locations: [] });
  });

  it("defaults a missing quantity-state name to 0 rather than throwing", () => {
    const levels: ShopifyInventoryLevelNode[] = [{ location: { id: "loc1", name: "Only Location" }, quantities: [{ name: "committed", quantity: 4 }] }];

    const snapshot = summarizeInventory(levels);

    expect(snapshot.onHand).toBe(0);
    expect(snapshot.locations[0]).toEqual({ locationId: "loc1", locationName: "Only Location", onHand: 0, available: 0 });
  });
});
