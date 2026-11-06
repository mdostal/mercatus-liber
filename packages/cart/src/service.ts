import { randomUUID } from "node:crypto";
import type { EventBus, LineCustomization, Money } from "@mercatus-liber/core";
import { CartNotFoundError, InvalidUnitPriceError, SkuNotAvailableError } from "./types.js";
import type { Cart, CartItem, CartRepository, SkuLookup } from "./types.js";

/** A made-to-order line. Call this from the server only, with a price it computed itself: the cart stores `unitPrice` as given. */
export interface AddItemOptions {
  customization?: LineCustomization;
  /** The customized price per unit. Only accepted with `customization`, and must be in the SKU's currency. */
  unitPrice?: Money;
}

/** The same choices in any key order produce the same string, so identical lines merge. */
function customizationKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function isTarget(item: CartItem, skuId: string, lineId: string | undefined): boolean {
  return item.skuId === skuId && (lineId === undefined || item.lineId === lineId);
}

export interface CartService {
  createCart(): Promise<Cart>;
  getCart(id: string): Promise<Cart | null>;
  /** customizationNote is additive/optional (see types.ts's CartItem doc comment) -- every existing 3-arg call site keeps working unchanged. */
  addItem(cartId: string, skuId: string, quantity: number, customizationNote?: string, options?: AddItemOptions): Promise<Cart>;
  /** With a lineId, removes only that line. Without one, removes every line of the SKU. */
  removeItem(cartId: string, skuId: string, lineId?: string): Promise<Cart>;
  /** quantity <= 0 removes the line item, matching common cart UX. With a lineId, changes only that line. */
  updateQuantity(cartId: string, skuId: string, quantity: number, lineId?: string): Promise<Cart>;
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

    async addItem(cartId, skuId, quantity, customizationNote, options) {
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
      const customization = options?.customization;
      const unitPrice = options?.unitPrice;
      if (unitPrice) {
        if (!customization) throw new InvalidUnitPriceError("a unit price is only accepted on a customized line");
        if (unitPrice.currency !== sku.price.currency) throw new InvalidUnitPriceError(`expected ${sku.price.currency}, got ${unitPrice.currency}`);
        if (!Number.isInteger(unitPrice.amount) || unitPrice.amount < 0) throw new InvalidUnitPriceError(`amount must be a non-negative integer, got ${unitPrice.amount}`);
      }
      const priceSnapshot = unitPrice ?? sku.price;
      const key = customization ? customizationKey(customization) : undefined;
      // A different customization or price is a different thing to make and charge for, so it stays its own line.
      const existing = cart.items.find(
        (item) =>
          item.skuId === skuId &&
          item.customizationNote === note &&
          (item.customization ? customizationKey(item.customization) : undefined) === key &&
          item.priceSnapshot.amount === priceSnapshot.amount,
      );
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.items.push({
          skuId,
          quantity,
          priceSnapshot,
          ...(note ? { customizationNote: note } : {}),
          ...(customization ? { customization, lineId: randomUUID() } : {}),
        });
      }
      await repository.save(cart);
      await events.publish("cart.item.added", { cartId, skuId, quantity });
      return cart;
    },

    async removeItem(cartId, skuId, lineId) {
      const cart = await requireCart(cartId);
      cart.items = cart.items.filter((item) => !isTarget(item, skuId, lineId));
      await repository.save(cart);
      await events.publish("cart.item.removed", { cartId, skuId });
      return cart;
    },

    async updateQuantity(cartId, skuId, quantity, lineId) {
      const cart = await requireCart(cartId);
      if (quantity <= 0) {
        cart.items = cart.items.filter((item) => !isTarget(item, skuId, lineId));
      } else {
        const existing = cart.items.find((item) => isTarget(item, skuId, lineId));
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
