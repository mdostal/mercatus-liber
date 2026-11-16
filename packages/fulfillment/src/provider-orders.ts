import type { EventBus } from "@mercatus-liber/core";
import type { FulfillmentAdapter, FulfillmentLineStatus, FulfillmentProviderKey } from "./types.js";

/**
 * Which provider order was placed for which store order, and the last status
 * the provider reported for it.
 *
 * A provider's webhook names its own order id, not the store's, so this is how
 * a "shipped" delivery is traced back to a store order. It also lets an
 * adapter that can only read an order by the provider's id (Slant 3D,
 * Printify) find it again after a restart.
 */
export interface ProviderOrderLink {
  orderId: string;
  provider: FulfillmentProviderKey;
  externalOrderId: string;
  /** The order lines this provider order makes. Empty when that was not recorded, which means all of the order's lines at this provider. */
  skuIds: string[];
  /** null until the provider has reported one. */
  status: FulfillmentLineStatus | null;
  trackingNumber: string | null;
  /** A plain carrier name such as "DHL", when the provider gives one. */
  carrier: string | null;
}

export interface ProviderOrderStatus {
  status: FulfillmentLineStatus;
  trackingNumber: string | null;
  carrier: string | null;
}

export interface ProviderOrderLinkRepository {
  /** Records that `externalOrderId` is the provider's order for `orderId`. Linking the same pair again keeps its stored status, and keeps its `skuIds` unless new ones are given. */
  link(input: { orderId: string; provider: FulfillmentProviderKey; externalOrderId: string; skuIds?: string[] }): Promise<void>;
  /** The most recently linked provider order for a store order, or null. An order re-placed after a cancellation has more than one. */
  latestForOrder(orderId: string, provider: FulfillmentProviderKey): Promise<ProviderOrderLink | null>;
  /** Every provider order linked to a store order, oldest link first. A provider that takes one item per order has one per line. */
  listForOrder(orderId: string, provider: FulfillmentProviderKey): Promise<ProviderOrderLink[]>;
  /** A provider's orders that can still change: every link whose status is not "delivered" or "unfulfilled". For providers that are polled instead of sending webhooks. */
  listOpen(provider: FulfillmentProviderKey): Promise<ProviderOrderLink[]>;
  findByExternalOrderId(provider: FulfillmentProviderKey, externalOrderId: string): Promise<ProviderOrderLink | null>;
  /** Stores the provider's latest status on an existing link. Does nothing when there is no such link. */
  saveStatus(provider: FulfillmentProviderKey, externalOrderId: string, status: ProviderOrderStatus): Promise<void>;
}

/** True for the two statuses a provider order does not leave: delivered, and unfulfilled (cancelled or rejected). */
export function isClosedStatus(status: FulfillmentLineStatus | null): boolean {
  return status === "delivered" || status === "unfulfilled";
}

const copy = (link: ProviderOrderLink): ProviderOrderLink => ({ ...link, skuIds: [...link.skuIds] });

export function createInMemoryProviderOrderLinkRepository(): ProviderOrderLinkRepository {
  // Insertion order is link order; re-linking an existing pair leaves it in place.
  const links = new Map<string, ProviderOrderLink>();
  const key = (provider: string, externalOrderId: string) => JSON.stringify([provider, externalOrderId]);

  return {
    async link({ orderId, provider, externalOrderId, skuIds }) {
      const existing = links.get(key(provider, externalOrderId));
      if (existing) {
        existing.orderId = orderId;
        if (skuIds) existing.skuIds = [...skuIds];
        return;
      }
      links.set(key(provider, externalOrderId), { orderId, provider, externalOrderId, skuIds: [...(skuIds ?? [])], status: null, trackingNumber: null, carrier: null });
    },
    async latestForOrder(orderId, provider) {
      let latest: ProviderOrderLink | null = null;
      for (const link of links.values()) if (link.orderId === orderId && link.provider === provider) latest = link;
      return latest ? copy(latest) : null;
    },
    async listForOrder(orderId, provider) {
      return [...links.values()].filter((link) => link.orderId === orderId && link.provider === provider).map(copy);
    },
    async listOpen(provider) {
      return [...links.values()].filter((link) => link.provider === provider && !isClosedStatus(link.status)).map(copy);
    },
    async findByExternalOrderId(provider, externalOrderId) {
      const link = links.get(key(provider, externalOrderId));
      return link ? copy(link) : null;
    },
    async saveStatus(provider, externalOrderId, status) {
      const link = links.get(key(provider, externalOrderId));
      if (link) Object.assign(link, { status: status.status, trackingNumber: status.trackingNumber, carrier: status.carrier });
    },
  };
}

/**
 * Wraps an adapter so every order it places is linked: after `submitOrder`,
 * each provider order id on the returned records is stored against the store
 * order, with the lines it covers. A failure to store the link is not allowed to fail the submit, since
 * the provider order already exists; it is passed to `onLinkError` instead.
 */
export function withProviderOrderLinks<A extends FulfillmentAdapter>(
  adapter: A,
  provider: FulfillmentProviderKey,
  links: ProviderOrderLinkRepository,
  onLinkError: (err: unknown, orderId: string) => void = () => {},
): A {
  return {
    ...adapter,
    async submitOrder(input: Parameters<FulfillmentAdapter["submitOrder"]>[0]) {
      const records = await adapter.submitOrder(input);
      // One link per provider order, each with the lines it makes: a provider may split a store order into several.
      const skuIdsByExternalOrderId = new Map<string, string[]>();
      for (const record of records) {
        if (!record.externalOrderId) continue;
        const skuIds = skuIdsByExternalOrderId.get(record.externalOrderId) ?? [];
        skuIds.push(record.skuId);
        skuIdsByExternalOrderId.set(record.externalOrderId, skuIds);
      }
      for (const [externalOrderId, skuIds] of skuIdsByExternalOrderId) {
        try {
          await links.link({ orderId: input.orderId, provider, externalOrderId, skuIds });
        } catch (err) {
          onLinkError(err, input.orderId);
        }
      }
      return records;
    },
  };
}

/** A `resolveExternalOrderId` for adapters that read an order by the provider's own id. */
export function externalOrderIdsFrom(links: ProviderOrderLinkRepository, provider: FulfillmentProviderKey): (orderId: string) => Promise<string | null> {
  return async (orderId) => (await links.latestForOrder(orderId, provider))?.externalOrderId ?? null;
}

/** Published when a provider reports a new status or tracking number for a store order. */
export const FULFILLMENT_ORDER_STATUS_CHANGED = "fulfillment.order.status_changed";

export interface FulfillmentOrderStatusChanged extends ProviderOrderStatus {
  /**
   * The same for every publish of the same change, and different for every
   * different one: provider, provider order, status, tracking number and
   * carrier. A subscriber that must act once (sending an email) keys on this,
   * because a change is published again if a subscriber failed the first time.
   */
  changeId: string;
  orderId: string;
  /** The order lines this provider order makes. Empty means all of the order's lines at this provider. */
  skuIds: string[];
  provider: FulfillmentProviderKey;
  externalOrderId: string;
  /** What was stored before this update; null for the first one. */
  previousStatus: FulfillmentLineStatus | null;
}

/** What a provider's adapter read out of one webhook delivery. */
export interface ProviderOrderStatusUpdate extends ProviderOrderStatus {
  externalOrderId: string;
  /** The store order id, when the provider's payload carries it. Used only when no link is stored yet. */
  orderId?: string | null;
}

export type ProviderOrderStatusOutcome = "published" | "unchanged" | "unlinked";

/**
 * Turns provider status updates into `fulfillment.order.status_changed`.
 *
 * `record` finds the store order through the stored link (or the update's own
 * `orderId`, which it then links), and publishes only when the status,
 * tracking number or carrier differs from what is stored, so a provider
 * retrying a delivery or sending several updates in one state publishes once.
 * An update for a provider order nobody linked returns "unlinked" and
 * publishes nothing.
 *
 * The stored status is written after the publish, so a publish that throws is
 * published again when the provider retries.
 */
export function createProviderOrderStatusRecorder(deps: { links: ProviderOrderLinkRepository; events: EventBus }): {
  record(provider: FulfillmentProviderKey, update: ProviderOrderStatusUpdate): Promise<ProviderOrderStatusOutcome>;
} {
  const { links, events } = deps;
  return {
    async record(provider, update) {
      let link = await links.findByExternalOrderId(provider, update.externalOrderId);
      if (!link) {
        if (!update.orderId) return "unlinked";
        await links.link({ orderId: update.orderId, provider, externalOrderId: update.externalOrderId });
        link = { orderId: update.orderId, provider, externalOrderId: update.externalOrderId, skuIds: [], status: null, trackingNumber: null, carrier: null };
      }

      // A later update that omits tracking does not erase what an earlier one gave.
      // Nor does a late "shipped" undo "delivered": Slant's order status stops at shipped, so an update after delivery still says it.
      const next: ProviderOrderStatus = {
        status: link.status === "delivered" && update.status === "shipped" ? "delivered" : update.status,
        trackingNumber: update.trackingNumber ?? link.trackingNumber,
        carrier: update.carrier ?? link.carrier,
      };
      if (next.status === link.status && next.trackingNumber === link.trackingNumber && next.carrier === link.carrier) return "unchanged";

      await events.publish<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, {
        changeId: JSON.stringify([provider, link.externalOrderId, next.status, next.trackingNumber, next.carrier]),
        orderId: link.orderId,
        skuIds: link.skuIds,
        provider,
        externalOrderId: link.externalOrderId,
        ...next,
        previousStatus: link.status,
      });
      await links.saveStatus(provider, update.externalOrderId, next);
      return "published";
    },
  };
}
