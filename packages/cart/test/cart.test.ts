import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryCartRepository } from "../src/in-memory-repository.js";
import { createCartService, type CartService } from "../src/service.js";
import { CartNotFoundError, SkuNotAvailableError } from "../src/types.js";

describe("cart service", () => {
  let events: EventBus;
  let catalog: CatalogService;
  let cart: CartService;
  const emitted: { event: string; payload: unknown }[] = [];
  let activeSkuId: string;
  let inactiveSkuId: string;

  beforeEach(async () => {
    emitted.length = 0;
    events = createInMemoryEventBus();
    for (const name of ["cart.item.added", "cart.item.removed", "cart.item.updated", "cart.cleared"]) {
      events.subscribe(name, async (payload) => {
        emitted.push({ event: name, payload });
      });
    }
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });

    const product = await catalog.createProduct({
      slug: "organizer",
      title: "Organizer",
      description: "d",
      identifyingAttributeKeys: ["color"],
    });
    const activeSku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "red" }],
      price: { amount: 1500, currency: "USD" },
    });
    activeSkuId = activeSku.id;

    const inactiveSku = await catalog.createSku({
      productId: product.id,
      identifyingAttributes: [{ key: "color", value: "blue" }],
      price: { amount: 1500, currency: "USD" },
    });
    await persistence.skus.save({ ...inactiveSku, status: "archived" });
    inactiveSkuId = inactiveSku.id;

    cart = createCartService({
      repository: createInMemoryCartRepository(),
      skus: catalog, // structural typing -- catalog is never imported by src/, only by this test
      events,
    });
  });

  it("addItem creates a line item with a price snapshot for a valid, active SKU", async () => {
    const created = await cart.createCart();
    const updated = await cart.addItem(created.id, activeSkuId, 2);
    expect(updated.items).toEqual([{ skuId: activeSkuId, quantity: 2, priceSnapshot: { amount: 1500, currency: "USD" } }]);
    expect(emitted).toContainEqual({
      event: "cart.item.added",
      payload: { cartId: created.id, skuId: activeSkuId, quantity: 2 },
    });
  });

  it("addItem merges quantity when the same SKU is added again", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 2);
    const updated = await cart.addItem(created.id, activeSkuId, 3);
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]?.quantity).toBe(5);
  });

  it("rejects addItem for an inactive SKU and leaves the cart unchanged", async () => {
    const created = await cart.createCart();
    await expect(cart.addItem(created.id, inactiveSkuId, 1)).rejects.toThrow(SkuNotAvailableError);
    const unchanged = await cart.getCart(created.id);
    expect(unchanged?.items).toEqual([]);
  });

  it("rejects addItem for a nonexistent SKU and leaves the cart unchanged", async () => {
    const created = await cart.createCart();
    await expect(cart.addItem(created.id, "does-not-exist", 1)).rejects.toThrow(SkuNotAvailableError);
    const unchanged = await cart.getCart(created.id);
    expect(unchanged?.items).toEqual([]);
  });

  it("removeItem removes the line and publishes cart.item.removed", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 1);
    const updated = await cart.removeItem(created.id, activeSkuId);
    expect(updated.items).toEqual([]);
    expect(emitted).toContainEqual({ event: "cart.item.removed", payload: { cartId: created.id, skuId: activeSkuId } });
  });

  it("updateQuantity sets a new quantity, and quantity <= 0 removes the line", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 1);
    let updated = await cart.updateQuantity(created.id, activeSkuId, 5);
    expect(updated.items[0]?.quantity).toBe(5);
    updated = await cart.updateQuantity(created.id, activeSkuId, 0);
    expect(updated.items).toEqual([]);
  });

  it("clear empties the cart and publishes cart.cleared", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 1);
    const updated = await cart.clear(created.id);
    expect(updated.items).toEqual([]);
    expect(emitted).toContainEqual({ event: "cart.cleared", payload: { cartId: created.id } });
  });

  it("throws CartNotFoundError for an unknown cart id", async () => {
    await expect(cart.addItem("missing", activeSkuId, 1)).rejects.toThrow(CartNotFoundError);
  });

  it("addItem stores an optional customizationNote on the line, omitted entirely when not passed", async () => {
    const created = await cart.createCart();
    const updated = await cart.addItem(created.id, activeSkuId, 1, "Text: Sarah -- thread color: navy");
    expect(updated.items).toEqual([
      { skuId: activeSkuId, quantity: 1, priceSnapshot: { amount: 1500, currency: "USD" }, customizationNote: "Text: Sarah -- thread color: navy" },
    ]);

    const plain = await cart.createCart();
    const updatedPlain = await cart.addItem(plain.id, activeSkuId, 1);
    // No customizationNote key at all -- byte-identical to pre-personalization behavior.
    expect(updatedPlain.items).toEqual([{ skuId: activeSkuId, quantity: 1, priceSnapshot: { amount: 1500, currency: "USD" } }]);
    expect(Object.keys(updatedPlain.items[0]!)).not.toContain("customizationNote");
  });

  it("addItem merges quantity when the same SKU is re-added with the SAME customizationNote", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 1, "monogram: JD");
    const updated = await cart.addItem(created.id, activeSkuId, 2, "monogram: JD");
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]?.quantity).toBe(3);
  });

  it("addItem keeps two lines separate when the same SKU is added with DIFFERENT customizationNote text", async () => {
    const created = await cart.createCart();
    await cart.addItem(created.id, activeSkuId, 1, "monogram: JD");
    const updated = await cart.addItem(created.id, activeSkuId, 1, "monogram: AB");
    expect(updated.items).toHaveLength(2);
    expect(updated.items.map((i) => i.customizationNote).sort()).toEqual(["monogram: AB", "monogram: JD"]);
  });

  it("addItem treats a blank/whitespace-only customizationNote as no note", async () => {
    const created = await cart.createCart();
    const updated = await cart.addItem(created.id, activeSkuId, 1, "   ");
    expect(Object.keys(updated.items[0]!)).not.toContain("customizationNote");
  });
});
