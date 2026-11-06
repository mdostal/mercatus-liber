import type { LineCustomization, Sku } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryCartRepository } from "../src/in-memory-repository.js";
import { createCartService, type CartService } from "../src/service.js";
import { InvalidUnitPriceError } from "../src/types.js";

const SKU = { id: "s1", status: "active", price: { amount: 5000, currency: "USD" } } as Sku;
const RED: LineCustomization = { finish: "ams", colorMode: "palette", colors: { body: "red", lid: "black" } };
const BLUE: LineCustomization = { finish: "ams", colorMode: "palette", colors: { body: "blue", lid: "black" } };

describe("customized cart lines", () => {
  let cart: CartService;
  let id: string;

  beforeEach(async () => {
    cart = createCartService({ repository: createInMemoryCartRepository(), skus: { getSku: async () => SKU }, events: createInMemoryEventBus() });
    id = (await cart.createCart()).id;
  });

  const add = (customization: LineCustomization, amount = 8000, quantity = 1) => cart.addItem(id, "s1", quantity, undefined, { customization, unitPrice: { amount, currency: "USD" } });

  it("stores the customization and its price, with a line id", async () => {
    const { items } = await add(RED);
    expect(items[0]).toMatchObject({ customization: RED, priceSnapshot: { amount: 8000, currency: "USD" } });
    expect(items[0]!.lineId).toBeTruthy();
  });

  it("🔍 keeps different customizations of one SKU as separate lines", async () => {
    await add(RED);
    const { items } = await add(BLUE, 8100);
    expect(items).toHaveLength(2);
  });

  it("🔍 merges the same choices even with keys in another order", async () => {
    await add(RED);
    const { items } = await add({ colors: { lid: "black", body: "red" }, colorMode: "palette", finish: "ams" });
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
  });

  it("🔍 keeps the same choices at a new price as a separate line", async () => {
    await add(RED, 8000);
    expect((await add(RED, 8500)).items).toHaveLength(2);
  });

  it("changes or removes only the line named", async () => {
    await add(RED);
    const { items } = await add(BLUE);
    const [first, second] = items;
    const updated = await cart.updateQuantity(id, "s1", 5, second!.lineId);
    expect(updated.items.map((i) => i.quantity)).toEqual([1, 5]);
    const removed = await cart.removeItem(id, "s1", first!.lineId);
    expect(removed.items.map((i) => i.lineId)).toEqual([second!.lineId]);
  });

  it("without a line id, removal still takes every line of the SKU", async () => {
    await add(RED);
    await add(BLUE);
    expect((await cart.removeItem(id, "s1")).items).toEqual([]);
  });

  it("🔍 refuses a unit price with no customization, in another currency, or not a whole non-negative amount", async () => {
    await expect(cart.addItem(id, "s1", 1, undefined, { unitPrice: { amount: 1, currency: "USD" } })).rejects.toThrow(InvalidUnitPriceError);
    for (const unitPrice of [{ amount: 1, currency: "EUR" }, { amount: -1, currency: "USD" }, { amount: 1.5, currency: "USD" }]) {
      await expect(cart.addItem(id, "s1", 1, undefined, { customization: RED, unitPrice })).rejects.toThrow(InvalidUnitPriceError);
    }
  });

  it("uses the SKU's price for a customized line with no unit price", async () => {
    const { items } = await cart.addItem(id, "s1", 1, undefined, { customization: RED });
    expect(items[0]!.priceSnapshot.amount).toBe(5000);
  });
});
