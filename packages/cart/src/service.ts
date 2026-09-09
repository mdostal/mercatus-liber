import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import { CartNotFoundError, SkuNotAvailableError } from "./types.js";
import type { Cart, CartRepository, SkuLookup } from "./types.js";

export interface CartService {
  createCart(): Promise<Cart>;
  getCart(id: string): Promise<Cart | null>;
  /** customizationNote is additive/optional (see types.ts's CartItem doc comment) -- every existing 3-arg call site keeps working unchanged. */
  addItem(cartId: string, skuId: string, quantity: number, customizationNote?: string): Promise<Cart>;
  removeItem(cartId: string, skuId: string): Promise<Cart>;
  /** quantity <= 0 removes the line item, matching common cart UX. */
  updateQuantity(cartId: string, skuId: string, quantity: number): Promise<Cart>;
  clear(cartId: string): Promise<Cart>;
}

export function createCartService(deps: {
  repository: CartRepository;
  skus: SkuLookup;
  events: EventBus;
}): CartService {
  const { repository, skus, events } = deps;

  async function requireCart(id: string): Promise<Cart> {
    const cart = await repository.get(id);
    if (!cart) throw new CartNotFoundError(id);
    return cart;
  }

  return {
    async createCart() {
      const cart: Cart = { id: randomUUID(), items: [] };
      await repository.save(cart);
      return cart;
    },

    async getCart(id) {
      return repository.get(id);
    },

    async addItem(cartId, skuId, quantity, customizationNote) {
      if (quantity <= 0) {
        throw new RangeError(`quantity must be > 0, got ${quantity}`);
      }
      const cart = await requireCart(cartId);
      const sku = await skus.getSku(skuId);
      if (!sku || sku.status !== "active") {
        throw new SkuNotAvailableError(skuId);
      }

      // Blank/whitespace-only note normalizes to "no note", same as omitting
      // it -- avoids a stray customizationNote key on an otherwise-plain line.
      const note = customizationNote?.trim() || undefined;
      // Merge by skuId AND customizationNote (both undefined counts as a
      // match) -- two lines of the same SKU with DIFFERENT personalization
      // text must stay separate lines, not silently collapse into one
      // (see types.ts's CartItem doc comment).
      const existing = cart.items.find((item) => item.skuId === skuId && item.customizationNote === note);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.items.push({ skuId, quantity, priceSnapshot: sku.price, ...(note ? { customizationNote: note } : {}) });
      }
      await repository.save(cart);
      await events.publish("cart.item.added", { cartId, skuId, quantity });
      return cart;
    },

    async removeItem(cartId, skuId) {
      const cart = await requireCart(cartId);
      cart.items = cart.items.filter((item) => item.skuId !== skuId);
      await repository.save(cart);
      await events.publish("cart.item.removed", { cartId, skuId });
      return cart;
    },

    async updateQuantity(cartId, skuId, quantity) {
      const cart = await requireCart(cartId);
      if (quantity <= 0) {
        cart.items = cart.items.filter((item) => item.skuId !== skuId);
      } else {
        const existing = cart.items.find((item) => item.skuId === skuId);
        if (existing) existing.quantity = quantity;
      }
      await repository.save(cart);
      await events.publish("cart.item.updated", { cartId, skuId, quantity });
      return cart;
    },

    async clear(cartId) {
      const cart = await requireCart(cartId);
      cart.items = [];
      await repository.save(cart);
      await events.publish("cart.cleared", { cartId });
      return cart;
    },
  };
}
