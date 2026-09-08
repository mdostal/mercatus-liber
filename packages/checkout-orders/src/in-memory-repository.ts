import type { Order, OrderRepository } from "./types.js";

/** Default in-memory OrderRepository -- same "zero infra out of the box" pattern as cart/core's in-memory defaults. */
export function createInMemoryOrderRepository(): OrderRepository {
  const orders = new Map<string, Order>();

  return {
    async get(id: string): Promise<Order | null> {
      const order = orders.get(id);
      return order ? structuredClone(order) : null;
    },
    async getByIdempotencyKey(key: string): Promise<Order | null> {
      for (const order of orders.values()) {
        if (order.idempotencyKey === key) return structuredClone(order);
      }
      return null;
    },
    async save(order: Order): Promise<void> {
      orders.set(order.id, structuredClone(order));
    },
  };
}
