import { createInMemoryInventoryAdapter, type InventoryAdapter } from "@mercatus-liber/inventory";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresInventoryAdapter } from "../src/index.js";
import { createFakePgPool, type FakePool } from "./fake-pool.js";

describe("createPostgresInventoryAdapter", () => {
  let pool: FakePool;
  let adapter: InventoryAdapter;

  beforeEach(async () => {
    pool = createFakePgPool();
    adapter = await createPostgresInventoryAdapter(pool as never);
  });

  it("getStock returns null for a SKU that was never touched", async () => {
    expect(await adapter.getStock("missing")).toBeNull();
  });

  it("setStock creates a real, readable stock row", async () => {
    await adapter.setStock("sku1", 40);
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 40, reserved: 0 });
  });

  it("setStock never touches an existing reserved count", async () => {
    await adapter.reserve("sku1", 3);
    await adapter.setStock("sku1", 40);
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 40, reserved: 3 });
  });

  it("reserve on a brand-new SKU implicitly starts it at onHand=0 and applies the reservation", async () => {
    await adapter.reserve("sku1", 5);
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 0, reserved: 5 });
  });

  it("reserve never throws even when it drives reserved above onHand -- oversell/backorder is allowed by contract", async () => {
    await adapter.setStock("sku1", 2);
    await expect(adapter.reserve("sku1", 10)).resolves.toBeUndefined();
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 2, reserved: 10 });
  });

  it("commit decrements both onHand and reserved by the same quantity", async () => {
    await adapter.setStock("sku1", 10);
    await adapter.reserve("sku1", 4);
    await adapter.commit("sku1", 4);
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 6, reserved: 0 });
  });

  it("release decrements only reserved, restoring availability", async () => {
    await adapter.setStock("sku1", 10);
    await adapter.reserve("sku1", 4);
    await adapter.release("sku1", 4);
    expect(await adapter.getStock("sku1")).toEqual({ skuId: "sku1", onHand: 10, reserved: 0 });
  });

  it("tracks multiple SKUs independently", async () => {
    await adapter.setStock("a", 10);
    await adapter.setStock("b", 20);
    await adapter.reserve("a", 3);
    expect(await adapter.getStock("a")).toEqual({ skuId: "a", onHand: 10, reserved: 3 });
    expect(await adapter.getStock("b")).toEqual({ skuId: "b", onHand: 20, reserved: 0 });
  });

  describe("behavioral parity with the in-memory reference adapter", () => {
    it("the same real operation sequence produces byte-identical StockLevel results on both adapters", async () => {
      const reference = createInMemoryInventoryAdapter();

      const ops: [keyof InventoryAdapter, [string, number]][] = [
        ["setStock", ["sku1", 50]],
        ["reserve", ["sku1", 5]],
        ["reserve", ["sku1", 3]],
        ["commit", ["sku1", 5]],
        ["release", ["sku1", 3]],
        ["setStock", ["sku2", 10]],
        ["reserve", ["sku2", 20]],
      ];

      for (const [method, args] of ops) {
        // @ts-expect-error -- deliberately generic dispatch over the shared InventoryAdapter interface
        await adapter[method](...args);
        // @ts-expect-error -- same
        await reference[method](...args);
      }

      expect(await adapter.getStock("sku1")).toEqual(await reference.getStock("sku1"));
      expect(await adapter.getStock("sku2")).toEqual(await reference.getStock("sku2"));
    });
  });
});
