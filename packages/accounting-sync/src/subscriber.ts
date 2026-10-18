import type { EventBus } from "@mercatus-liber/core";
import type { AccountingSyncService } from "./service.js";

/**
 * Wires accounting sync to checkout purely via events -- never a direct call
 * from checkout-orders, which has zero knowledge this subsystem exists.
 * Mirrors `@mercatus-liber/inventory`'s `registerInventorySync` and
 * `@mercatus-liber/internal-bi`'s `registerBiEventLogSync` in shape (a plain
 * function that subscribes handlers against an injected `EventBus`), but
 * deliberately departs from both of them on ONE point, documented here and
 * in `.pHive/epics/accounting-erp-sync-adapter/docs/design-discussion.md`
 * §3 ("Trigger point"):
 *
 * `registerInventorySync`/`registerBiEventLogSync`'s own `checkout.order.paid`
 * handlers are awaited inline, which is fine for them -- they only ever touch
 * this process's own in-memory/Postgres state, effectively instantaneous.
 * This subscriber's handler instead calls `AccountingSyncService.syncOrder`,
 * which (via a real adapter, e.g. `@mercatus-liber/adapter-quickbooks`) makes
 * a real outbound HTTP call to a third-party accounting API. `@mercatus-liber/
 * core`'s `createInMemoryEventBus` is explicitly documented as
 * "synchronous-per-publish (handlers are awaited in registration order before
 * publish() resolves)" -- and `checkout.order.paid` is itself published from
 * inside checkout-orders' own subscription to `payments.payment.succeeded`,
 * i.e. from the real Stripe webhook handler's event chain (see
 * `packages/checkout-orders/src/service.ts`). Awaiting a real external HTTP
 * call inline there would add that call's full latency (and any transient
 * failure) to the webhook handler's own response time -- genuinely
 * unacceptable for a "fire-and-forget, never block checkout" sync, per this
 * epic's own explicit design requirement.
 *
 * So this handler deliberately does NOT await `syncOrder` -- it dispatches
 * it and returns immediately. `AccountingSyncService.syncOrder` itself never
 * throws (see service.ts's own doc comment: failures are recorded, not
 * rethrown), so the one real risk of "fire-and-forget" -- an unhandled
 * promise rejection -- is closed at its source, not papered over with a
 * swallowed `.catch()` here. The one case `syncOrder` DOES throw
 * (`OrderNotFoundForAccountingSyncError`, a genuine programmer-error/race-
 * condition case that should never happen for a real orderId a real
 * `checkout.order.paid` event just carried) is caught here and logged rather
 * than left as an unhandled rejection -- a zero-infra reference posture; a
 * real deployment would route this to its own error-tracking/alerting, the
 * same honest gap this repo's own `PluginRegistry.initAll` discloses for
 * plugin init failures.
 *
 * A real multi-instance/queued deployment would replace this in-process,
 * synchronous-bus dispatch with a durable queue (the event bus's own doc
 * comment already names this as a later, separate adapter concern) -- out
 * of scope here, same "zero-infra default, real queueing is an adapter's
 * job" posture every other subsystem in this repo takes.
 */
export function registerAccountingSync(deps: { events: EventBus; sync: AccountingSyncService }): void {
  const { events, sync } = deps;

  events.subscribe<{ orderId: string }>("checkout.order.paid", async ({ orderId }) => {
    sync.syncOrder(orderId).catch((err: unknown) => {
      console.error(`accounting-sync: failed to dispatch sync for order ${orderId}:`, err);
    });
  });
}
