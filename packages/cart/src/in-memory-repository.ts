import type { Cart, CartRepository } from "./types.js";

/**
 * Default in-memory CartRepository -- good enough for a guest cart scoped to a
 * single process/session out of the box, matching "framework works with zero
 * infra" (docs/ARCHITECTURE.md principle 4). A durable, cross-device cart for a
 * logged-in shopper needs a real persistence adapter (e.g. a future
 * cart-table addition to @mercatus-liber/adapter-sqlite) -- tracked as an open
 * item in docs/subsystems/07-cart.md, not required for this reference default.
 */
export function createInMemoryCartRepository(): CartRepository {
  const carts = new Map<string, Cart>();
  return {
    async get(id: string): Promise<Cart | null> {
      const cart = carts.get(id);
      return cart ? structuredClone(cart) : null;
    },
    async save(cart: Cart): Promise<void> {
      carts.set(cart.id, structuredClone(cart));
    },
  };
}
