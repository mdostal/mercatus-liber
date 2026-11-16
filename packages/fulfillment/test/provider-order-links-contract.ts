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
      const link = { orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1", status: null, trackingNumber: null, carrier: null };
      expect(await repo.findByExternalOrderId("slant3d", "SL-1")).toEqual(link);
      expect(await repo.latestForOrder("order-1", "slant3d")).toEqual(link);
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
      expect(await repo.findByExternalOrderId("3dapi", "ord_1")).toEqual({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1", status: "shipped", trackingNumber: "TRK1", carrier: "DHL" });
    });

    it("returns the most recently linked provider order for a store order", async () => {
      const repo = (await setup()).open();
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_old" });
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_new" });
      // Re-linking the older one does not make it the latest.
      await repo.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_old" });
      expect((await repo.latestForOrder("order-1", "3dapi"))!.externalOrderId).toBe("ord_new");
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
