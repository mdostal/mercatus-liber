import { describe, expect, it } from "vitest";
import type { ProviderOrderLinkRepository } from "../src/provider-orders.js";

/** What every storage backend's provider order link repository must do. `open` returns a repository on the store; calling it again returns a new one on the same store. */
export function describeProviderOrderLinkContract(
  name: string,
  setup: () => Promise<{ open(): ProviderOrderLinkRepository }>,
  options: { timeout?: number } = {},
): void {
  describe(`${name}: provider order link contract`, { timeout: options.timeout ?? 5_000 }, () => {
    it("finds a link from either side, with no status until one is saved", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
      const link = { orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1", skuIds: [], status: null, trackingNumber: null, carrier: null };
      expect(await repo.findByExternalOrderId("slant3d", "SL-1")).toMatchObject(link);
      expect(await repo.latestForOrder("order-1", "slant3d")).toMatchObject(link);
      expect(await repo.findByExternalOrderId("slant3d", "nope")).toBeNull();
      expect(await repo.latestForOrder("nope", "slant3d")).toBeNull();
    });

    it("keeps two providers' orders apart, even with the same provider order id", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "X-1" });
      await repo.link({ orderId: "order-2", provider: "3dapi", externalOrderId: "X-1" });
      expect((await repo.findByExternalOrderId("slant3d", "X-1"))!.orderId).toBe("order-1");
      expect((await repo.findByExternalOrderId("3dapi", "X-1"))!.orderId).toBe("order-2");
      expect(await repo.latestForOrder("order-1", "3dapi")).toBeNull();
    });

    it("saves a status, and linking the same pair again keeps it", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1" });
      await repo.saveStatus("3dapi", "ord_1", { status: "shipped", trackingNumber: "TRK1", carrier: "DHL" });
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1" });
      expect(await repo.findByExternalOrderId("3dapi", "ord_1")).toMatchObject({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1", skuIds: [], status: "shipped", trackingNumber: "TRK1", carrier: "DHL" });
    });

    it("stores a tracking page with the status", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "printful", externalOrderId: "880011" });
      await repo.saveStatus("printful", "880011", { status: "shipped", trackingNumber: "TRK1", carrier: null, trackingUrl: "https://track.example/TRK1" });
      expect((await repo.findByExternalOrderId("printful", "880011"))!.trackingUrl).toBe("https://track.example/TRK1");
    });

    it("returns the most recently linked provider order for a store order", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_old" });
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_new" });
      // Re-linking the older one does not make it the latest.
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_old" });
      expect((await repo.latestForOrder("order-1", "3dapi"))!.externalOrderId).toBe("ord_new");
    });

    it("lists every provider order of a store order with its lines, oldest first", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-A", skuIds: ["sku-a"] });
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-B", skuIds: ["sku-b", "sku-c"] });
      await repo.link({ orderId: "order-2", provider: "x3d", externalOrderId: "X3D-C" });
      expect((await repo.listForOrder("order-1", "x3d")).map((l) => [l.externalOrderId, l.skuIds])).toEqual([["X3D-A", ["sku-a"]], ["X3D-B", ["sku-b", "sku-c"]]]);
      expect(await repo.listForOrder("order-1", "slant3d")).toEqual([]);
      // Linking again without skuIds keeps them; with skuIds replaces them.
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-A" });
      expect((await repo.findByExternalOrderId("x3d", "X3D-A"))!.skuIds).toEqual(["sku-a"]);
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-A", skuIds: ["sku-z"] });
      expect((await repo.findByExternalOrderId("x3d", "X3D-A"))!.skuIds).toEqual(["sku-z"]);
    });

    it("stores line ids alongside the lines, and leaves them out when none were given", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-A", skuIds: ["art-box"], lineIds: ["line-1"] });
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-B", skuIds: ["art-box"] });
      const [a, b] = await repo.listForOrder("order-1", "x3d");
      expect(a!.lineIds).toEqual(["line-1"]);
      expect(b!.lineIds).toBeUndefined();
      // Linking again without line ids keeps them.
      await repo.link({ orderId: "order-1", provider: "x3d", externalOrderId: "X3D-A" });
      expect((await repo.findByExternalOrderId("x3d", "X3D-A"))!.lineIds).toEqual(["line-1"]);
    });

    it("lists a provider's open orders: everything not delivered or unfulfilled", async () => {
      const repo = (await setup()).open();
      for (const id of ["new", "printing", "shipped", "done", "cancelled"]) await repo.link({ orderId: `o-${id}`, provider: "x3d", externalOrderId: id });
      await repo.link({ orderId: "o-other", provider: "slant3d", externalOrderId: "other" });
      await repo.saveStatus("x3d", "printing", { status: "submitted", trackingNumber: null, carrier: null });
      await repo.saveStatus("x3d", "shipped", { status: "shipped", trackingNumber: "T", carrier: null });
      await repo.saveStatus("x3d", "done", { status: "delivered", trackingNumber: "T", carrier: null });
      await repo.saveStatus("x3d", "cancelled", { status: "unfulfilled", trackingNumber: null, carrier: null });
      expect((await repo.listOpen("x3d")).map((l) => l.externalOrderId)).toEqual(["new", "printing", "shipped"]);
    });

    it("ignores a status for an order that was never linked", async () => {
      const repo = (await setup()).open();
      await repo.saveStatus("slant3d", "ghost", { status: "shipped", trackingNumber: null, carrier: null });
      expect(await repo.findByExternalOrderId("slant3d", "ghost")).toBeNull();
    });

    it("keeps links across repository instances on the same store", async () => {
      const store = await setup();
      await store.open().link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
      expect((await store.open().latestForOrder("order-1", "slant3d"))?.externalOrderId).toBe("SL-1");
    });
  });
}
