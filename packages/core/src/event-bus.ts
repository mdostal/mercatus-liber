/**
 * The typed pub/sub contract every subsystem uses for side-effecting,
 * cross-subsystem reactions instead of direct calls. See docs/ARCHITECTURE.md
 * principle 5 ("Events over direct calls for side effects").
 *
 * Naming convention: "<subsystem>.<thing>.<pastTenseVerb>", e.g.
 * "checkout.order.placed", "inventory.stock.depleted", "catalog.product.updated".
 */

export interface EventBus {
  publish<T>(eventName: string, payload: T): Promise<void>;
  subscribe<T>(eventName: string, handler: (payload: T) => Promise<void>): void;
}

type Handler = (payload: unknown) => Promise<void>;

/**
 * Default in-process implementation -- good enough for a single-process deploy
 * (e.g. the reference storefront). A queue/Redis-backed EventBus implementation
 * for multi-instance deploys is a later, separate adapter; this default ships in
 * core because it has no external dependency, matching "framework works with zero
 * infra out of the box" (docs/ARCHITECTURE.md principle 4).
 *
 * Delivery is at-least-once, synchronous-per-publish (handlers are awaited in
 * registration order before publish() resolves), best-effort only -- a handler
 * that throws does not prevent other handlers for the same event from running,
 * but the error is rethrown after all handlers have been attempted. See
 * docs/subsystems/00-core-schema.md open question 3 for the documented tradeoff.
 */
export function createInMemoryEventBus(): EventBus {
  const handlers = new Map<string, Handler[]>();

  return {
    async publish<T>(eventName: string, payload: T): Promise<void> {
      const eventHandlers = handlers.get(eventName) ?? [];
      const errors: unknown[] = [];
      for (const handler of eventHandlers) {
        try {
          await handler(payload);
        } catch (err) {
          errors.push(err);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, `One or more handlers for "${eventName}" failed`);
      }
    },
    subscribe<T>(eventName: string, handler: (payload: T) => Promise<void>): void {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler as Handler);
      handlers.set(eventName, existing);
    },
  };
}
