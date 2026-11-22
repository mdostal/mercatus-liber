/**
 * Found by the shop dogfooding a8e6b2d: a cart-wide coupon showed in the
 * preview and on the order, but the payment page summed undiscounted line
 * prices and asked for the full amount. The amount charged must equal the
 * preview total plus shipping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("checkout charges what the preview shows", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("with a 15% cart-wide code over several lines and quantities", async () => {
    for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_URI", "CONVEX_URL", "SQLITE_FILE_PATH", "SANITY_PROJECT_ID", "STRIPE_SECRET_KEY", "PAYPAL_CLIENT_ID"]) vi.stubEnv(key, "");
    vi.resetModules();
    const { getServicesForDemo, __resetServicesCacheForTests } = await import("../lib/services");
    __resetServicesCacheForTests();
    const s = await getServicesForDemo("print-shop");
    const cart = await s.cart.createCart();
    const products = (await s.catalog.listProducts({ status: "active" })).slice(0, 3);
    for (const [i, product] of products.entries()) {
      const sku = (await s.catalog.listSkusByProduct(product.id)).find((k) => k.status === "active")!;
      await s.cart.addItem(cart.id, sku.id, i + 1);
    }
    const preview = await s.checkout.previewCheckout({ cartId: cart.id, couponCode: "STITCH15" });
    expect(preview.appliedCode).toBe("STITCH15");
    expect(preview.discountTotal.amount).toBeGreaterThan(0);
    const { order, redirectUrl } = await s.checkout.startCheckout({
      cartId: cart.id,
      idempotencyKey: cart.id,
      couponCode: "STITCH15",
      shippingInfo: { name: "Ada", email: "ada@example.com", address: "1 Main St", countryCode: "US" },
      successUrl: "https://s/ok",
      cancelUrl: "https://s/no",
    });
    const charged = Number(new URL(redirectUrl, "https://commerce.example").searchParams.get("total"));
    expect(charged).toBe(preview.total.amount + (order.shippingTotal?.amount ?? 0));
    expect(order.discountTotal).toEqual(preview.discountTotal);
  });
});
