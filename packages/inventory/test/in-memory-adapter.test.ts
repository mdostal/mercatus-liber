import { describe, expect, it } from "vitest";
import { createInMemoryInventoryAdapter } from "../src/in-memory-adapter.js";

describe("createInMemoryInventoryAdapter", () => {
  it("setStock followed by reserve computes available as onHand - reserved", async () => {
    const inventory = createInMemoryInventoryAdapter();
    await inventory.setStock("sku-1", 10);
    await inventory.reserve("sku-1", 3);
    const level = await inventory.getStock("sku-1");
    expect(level).toEqual({ skuId: "sku-1", onHand: 10, reserved: 3 });
  });

  it("commit decrements BOTH onHand and reserved", async () => {
    const inventory = createInMemoryInventoryAdapter();
    await inventory.setStock("sku-1", 10);
    await inventory.reserve("sku-1", 3);
    await inventory.commit("sku-1", 3);
    expect(await inventory.getStock("sku-1")).toEqual({ skuId: "sku-1", onHand: 7, reserved: 0 });
  });

  it("release decrements reserved only, restoring availability", async () => {
    const inventory = createInMemoryInventoryAdapter();
    await inventory.setStock("sku-1", 10);
    await inventory.reserve("sku-1", 3);
    await inventory.release("sku-1", 3);
    expect(await inventory.getStock("sku-1")).toEqual({ skuId: "sku-1", onHand: 10, reserved: 0 });
  });

  it("reserve never throws, even for more quantity than is available (oversell/backorder allowed)", async () => {
    const inventory = createInMemoryInventoryAdapter();
    await inventory.setStock("sku-1", 2);
    await expect(inventory.reserve("sku-1", 100)).resolves.toBeUndefined();
    expect(await inventory.getStock("sku-1")).toEqual({ skuId: "sku-1", onHand: 2, reserved: 100 });
  });

  it("getStock returns null for a SKU that has never been touched", async () => {
    const inventory = createInMemoryInventoryAdapter();
    expect(await inventory.getStock("never-seen")).toBeNull();
  });

  it("reserve/commit/release initialize a stock record at onHand=0 if setStock was never called", async () => {
    const inventory = createInMemoryInventoryAdapter();
    await inventory.reserve("sku-2", 1);
    expect(await inventory.getStock("sku-2")).toEqual({ skuId: "sku-2", onHand: 0, reserved: 1 });
  });
});
