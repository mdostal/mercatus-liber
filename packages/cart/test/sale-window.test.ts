import { createInMemoryEventBus, type Sku } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createCartService, createInMemoryCartRepository, SkuNotAvailableError, SkuNotOnSaleError } from "../src/index.js";

const OPEN = "2026-11-30T18:00:00.000Z";
const CLOSE = "2026-12-07T18:00:00.000Z";
const sku: Sku = { id: "tee-m", productId: "tee", identifyingAttributes: [{ key: "size", value: "M" }], price: { amount: 3000, currency: "USD" }, status: "active" };

function cartAt(iso: string, product: { activeFrom?: string; activeTo?: string } | null, skuOver: Partial<Sku> = {}) {
  return createCartService({
    repository: createInMemoryCartRepository(),
    skus: { getSku: async () => ({ ...sku, ...skuOver }), getProduct: async () => product },
    events: createInMemoryEventBus(),
    now: () => new Date(iso),
  });
}

describe("sale windows in the cart", () => {
  it("refuses a SKU before its product's window opens and after it ends, and accepts it inside", async () => {
    const line = { activeFrom: OPEN, activeTo: CLOSE };
    const early = cartAt("2026-11-30T17:59:59Z", line);
    const c1 = await early.createCart();
    const refused = await early.addItem(c1.id, "tee-m", 1).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SkuNotOnSaleError);
    expect(refused).toBeInstanceOf(SkuNotAvailableError);
    expect(refused).toMatchObject({ state: "upcoming", startsAt: OPEN, message: `This item goes on sale at ${OPEN}.` });

    const during = cartAt(OPEN, line);
    const c2 = await during.createCart();
    expect((await during.addItem(c2.id, "tee-m", 1)).items).toHaveLength(1);

    const late = cartAt(CLOSE, line);
    const c3 = await late.createCart();
    await expect(late.addItem(c3.id, "tee-m", 1)).rejects.toMatchObject({ state: "ended", endsAt: CLOSE });
  });

  it("applies the SKU's own window, and works without getProduct", async () => {
    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: { getSku: async () => ({ ...sku, activeTo: OPEN }) }, events: createInMemoryEventBus(), now: () => new Date(CLOSE) });
    const c = await cart.createCart();
    await expect(cart.addItem(c.id, "tee-m", 1)).rejects.toBeInstanceOf(SkuNotOnSaleError);
    const open = cartAt(OPEN, null);
    const c2 = await open.createCart();
    expect((await open.addItem(c2.id, "tee-m", 1)).items).toHaveLength(1);
  });
});
