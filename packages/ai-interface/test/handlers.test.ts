import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCommerceToolHandlers } from "../src/handlers.js";
import type { CommerceToolDeps } from "../src/types.js";

function buildFakeDeps() {
  const catalog = {
    getProductBySlug: vi.fn(async (slug: string) => ({ id: "prod-1", slug, title: "T", description: "D", identifyingAttributeKeys: [], status: "active" as const })),
    listSkusByProduct: vi.fn(async () => [{ id: "sku-1", productId: "prod-1", identifyingAttributes: [], price: { amount: 100, currency: "USD" } }]),
  };
  const search = {
    query: vi.fn(async () => [{ id: "prod-1", title: "T", description: "D" }]),
  };
  const cart = {
    createCart: vi.fn(async () => ({ id: "cart-1" })),
    addItem: vi.fn(async (cartId: string, skuId: string, quantity: number) => ({ id: cartId, items: [{ skuId, quantity }] })),
    getCart: vi.fn(async (id: string) => ({ id, items: [] })),
  };
  const checkout = {
    startCheckout: vi.fn(async () => ({ order: { id: "order-1", status: "pending_payment" }, redirectUrl: "https://checkout.example/order-1" })),
    getOrder: vi.fn(async (id: string) => ({ id, status: "paid", items: [] })),
  };
  const catalogAdmin = {
    createProduct: vi.fn(async (input: unknown) => ({ id: "prod-2", ...input as object })),
    updateProduct: vi.fn(async (id: string, patch: unknown) => ({ id, ...patch as object })),
  };
  const cms = {
    createPage: vi.fn(async (input: unknown) => ({ id: "page-2", title: (input as { title: string }).title, status: "draft" })),
    updatePage: vi.fn(async (id: string, patch: unknown) => ({ id, title: (patch as { title?: string }).title ?? "Untitled", status: "draft" })),
    publishPage: vi.fn(async (id: string) => ({ id, title: "T", status: "published" })),
  };
  const inventory = {
    getStock: vi.fn(async (skuId: string) => ({ skuId, onHand: 5, reserved: 0 })),
    setStock: vi.fn(async () => {}),
  };
  const deps: CommerceToolDeps = { catalog, search, cart, checkout, catalogAdmin, cms, inventory };
  return { deps, catalog, search, cart, checkout, catalogAdmin, cms, inventory };
}

describe("createCommerceToolHandlers", () => {
  let fakes: ReturnType<typeof buildFakeDeps>;
  let handlers: ReturnType<typeof createCommerceToolHandlers>;

  beforeEach(() => {
    fakes = buildFakeDeps();
    handlers = createCommerceToolHandlers(fakes.deps);
  });

  describe("shopper tools -- execute directly, delegate unmodified", () => {
    it("search_products delegates to search.query", async () => {
      const result = await handlers.search_products!({ text: "dragon" });
      expect(fakes.search.query).toHaveBeenCalledWith({ text: "dragon" });
      expect(result).toEqual([{ id: "prod-1", title: "T", description: "D" }]);
    });

    it("get_product delegates to catalog.getProductBySlug + listSkusByProduct", async () => {
      const result = await handlers.get_product!({ slug: "organizer" });
      expect(fakes.catalog.getProductBySlug).toHaveBeenCalledWith("organizer");
      expect(result).toMatchObject({ product: { slug: "organizer" } });
    });

    it("get_product returns null for an unknown slug", async () => {
      fakes.catalog.getProductBySlug.mockResolvedValueOnce(null);
      const result = await handlers.get_product!({ slug: "nope" });
      expect(result).toBeNull();
    });

    it("add_to_cart creates a cart when cartId is omitted, then delegates to addItem", async () => {
      const result = await handlers.add_to_cart!({ skuId: "sku-1", quantity: 2 });
      expect(fakes.cart.createCart).toHaveBeenCalled();
      expect(fakes.cart.addItem).toHaveBeenCalledWith("cart-1", "sku-1", 2);
      expect(result).toEqual({ id: "cart-1", items: [{ skuId: "sku-1", quantity: 2 }] });
    });

    it("add_to_cart reuses an existing cartId without creating a new cart", async () => {
      await handlers.add_to_cart!({ cartId: "cart-9", skuId: "sku-1", quantity: 1 });
      expect(fakes.cart.createCart).not.toHaveBeenCalled();
      expect(fakes.cart.addItem).toHaveBeenCalledWith("cart-9", "sku-1", 1);
    });

    it("get_cart delegates to cart.getCart", async () => {
      await handlers.get_cart!({ cartId: "cart-9" });
      expect(fakes.cart.getCart).toHaveBeenCalledWith("cart-9");
    });

    it("start_checkout delegates the raw input to checkout.startCheckout, executing directly (no confirm flag)", async () => {
      const input = {
        cartId: "cart-1",
        idempotencyKey: "idem-1",
        shippingInfo: { name: "A", email: "a@example.com", address: "1 Main St" },
        successUrl: "https://s",
        cancelUrl: "https://c",
      };
      const result = await handlers.start_checkout!(input);
      expect(fakes.checkout.startCheckout).toHaveBeenCalledWith(input);
      expect(result).toMatchObject({ redirectUrl: "https://checkout.example/order-1" });
    });

    it("get_order_status delegates to checkout.getOrder", async () => {
      await handlers.get_order_status!({ orderId: "order-1" });
      expect(fakes.checkout.getOrder).toHaveBeenCalledWith("order-1");
    });
  });

  describe("admin tools -- confirm-gated", () => {
    it("create_product WITHOUT confirm:true returns a preview and does NOT call catalogAdmin.createProduct", async () => {
      const result = await handlers.create_product!({ slug: "s", title: "T", description: "D", identifyingAttributeKeys: [] });
      expect(result).toMatchObject({ requiresConfirmation: true });
      expect(fakes.catalogAdmin.createProduct).not.toHaveBeenCalled();
    });

    it("create_product WITH confirm:true calls catalogAdmin.createProduct and returns the real result", async () => {
      const result = await handlers.create_product!({ slug: "s", title: "T", description: "D", identifyingAttributeKeys: [], confirm: true });
      expect(fakes.catalogAdmin.createProduct).toHaveBeenCalledWith({ slug: "s", title: "T", description: "D", identifyingAttributeKeys: [] });
      expect(result).toMatchObject({ id: "prod-2" });
    });

    it("update_product WITHOUT confirm:true previews only", async () => {
      const result = await handlers.update_product!({ id: "prod-1", title: "New" });
      expect(result).toMatchObject({ requiresConfirmation: true });
      expect(fakes.catalogAdmin.updateProduct).not.toHaveBeenCalled();
    });

    it("update_product WITH confirm:true executes", async () => {
      await handlers.update_product!({ id: "prod-1", title: "New", confirm: true });
      expect(fakes.catalogAdmin.updateProduct).toHaveBeenCalledWith("prod-1", { title: "New" });
    });

    it("manage_cms_page WITHOUT confirm:true previews only, for both update and publish actions", async () => {
      const updateResult = await handlers.manage_cms_page!({ id: "page-1", action: "update", title: "New" });
      const publishResult = await handlers.manage_cms_page!({ id: "page-1", action: "publish" });
      expect(updateResult).toMatchObject({ requiresConfirmation: true });
      expect(publishResult).toMatchObject({ requiresConfirmation: true });
      expect(fakes.cms.updatePage).not.toHaveBeenCalled();
      expect(fakes.cms.publishPage).not.toHaveBeenCalled();
    });

    it("manage_cms_page WITH confirm:true executes update", async () => {
      await handlers.manage_cms_page!({ id: "page-1", action: "update", title: "New", confirm: true });
      expect(fakes.cms.updatePage).toHaveBeenCalledWith("page-1", { title: "New" });
    });

    it("manage_cms_page WITH confirm:true executes publish", async () => {
      await handlers.manage_cms_page!({ id: "page-1", action: "publish", confirm: true });
      expect(fakes.cms.publishPage).toHaveBeenCalledWith("page-1");
    });

    it("manage_cms_page WITHOUT confirm:true previews only, for the create action, and does not create a page", async () => {
      const result = await handlers.manage_cms_page!({
        action: "create",
        pageType: "landing",
        slug: "new-page",
        title: "New Page",
        sections: [],
      });
      expect(result).toMatchObject({ requiresConfirmation: true });
      expect(fakes.cms.createPage).not.toHaveBeenCalled();
    });

    it("manage_cms_page WITH confirm:true creates a page via cms.createPage and returns it", async () => {
      const result = await handlers.manage_cms_page!({
        action: "create",
        pageType: "landing",
        slug: "new-page",
        title: "New Page",
        sections: [],
        confirm: true,
      });
      expect(fakes.cms.createPage).toHaveBeenCalledWith({ pageType: "landing", slug: "new-page", title: "New Page", sections: [] });
      expect(result).toMatchObject({ id: "page-2", title: "New Page", status: "draft" });
    });

    it.each([
      ["pageType", { slug: "s", title: "T", sections: [] }],
      ["slug", { pageType: "landing", title: "T", sections: [] }],
      ["title", { pageType: "landing", slug: "s", sections: [] }],
      ["sections", { pageType: "landing", slug: "s", title: "T" }],
    ])("manage_cms_page create with confirm:true missing '%s' throws a clear error and does not create a page", async (missingField, rest) => {
      await expect(
        handlers.manage_cms_page!({ action: "create", ...rest, confirm: true }),
      ).rejects.toThrow(new RegExp(missingField));
      expect(fakes.cms.createPage).not.toHaveBeenCalled();
    });

    it("adjust_inventory WITHOUT confirm:true previews only", async () => {
      const result = await handlers.adjust_inventory!({ skuId: "sku-1", onHand: 10 });
      expect(result).toMatchObject({ requiresConfirmation: true });
      expect(fakes.inventory.setStock).not.toHaveBeenCalled();
    });

    it("adjust_inventory WITH confirm:true executes and returns the updated stock", async () => {
      const result = await handlers.adjust_inventory!({ skuId: "sku-1", onHand: 10, confirm: true });
      expect(fakes.inventory.setStock).toHaveBeenCalledWith("sku-1", 10);
      expect(result).toMatchObject({ skuId: "sku-1", onHand: 5 });
    });
  });
});
