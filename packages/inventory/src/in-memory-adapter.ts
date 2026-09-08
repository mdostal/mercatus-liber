import type { InventoryAdapter, StockLevel } from "./types.js";

/** Default in-house InventoryAdapter -- same "zero infra out of the box" pattern as every other default in this project. */
export function createInMemoryInventoryAdapter(): InventoryAdapter {
  const stocks = new Map<string, StockLevel>();

  function getOrInit(skuId: string): StockLevel {
    const existing = stocks.get(skuId);
    if (existing) return existing;
    const created: StockLevel = { skuId, onHand: 0, reserved: 0 };
    stocks.set(skuId, created);
    return created;
  }

  return {
    async getStock(skuId) {
      const level = stocks.get(skuId);
      return level ? { ...level } : null;
    },

    async setStock(skuId, onHand) {
      const level = getOrInit(skuId);
      level.onHand = onHand;
    },

    async reserve(skuId, quantity) {
      const level = getOrInit(skuId);
      level.reserved += quantity;
    },

    async commit(skuId, quantity) {
      const level = getOrInit(skuId);
      level.onHand -= quantity;
      level.reserved -= quantity;
    },

    async release(skuId, quantity) {
      const level = getOrInit(skuId);
      level.reserved -= quantity;
    },
  };
}
