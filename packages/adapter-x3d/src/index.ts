import {
  InvalidCatalogMappingError,
  requireCatalogTarget,
  type FulfillmentAdapter,
  type FulfillmentLineRecord,
  type ProviderCatalogMappingRepository,
  type ProviderOrderLinkRepository,
  type ProviderOrderStatusOutcome,
  type ProviderOrderStatusUpdate,
  type SubmitFulfillmentOrderInput,
} from "@mercatus-liber/fulfillment";
import { createX3dHttpClient, X3dApiError, type X3dHttpClient } from "./http-client.js";
import { buildX3dLineRecords, isSlicedX3dFile, mapRecipientToX3d, mapX3dOrderStatus, parseX3dCatalogTarget, x3dFileNameFor, x3dOrderStatusUpdateFrom, type X3dCatalogTarget } from "./mapping.js";
import { X3D_PROVIDER } from "./provider.js";
import type { X3dCreateOrderResponse, X3dModelSource, X3dOrder, X3dShippingSpeed } from "./x3d-types.js";

export * from "./provider.js";
export * from "./x3d-types.js";
export * from "./http-client.js";
export * from "./mapping.js";

/** Which X3D order was placed for which line of which store order. */
export interface X3dOrderStore {
  list(orderId: string): Promise<{ code: string; skuIds: string[]; lineIds?: string[] }[]>;
  /** Called straight after X3D accepts an order, before anything else is sent. `lineId` is given when the order's lines have ids. */
  remember(orderId: string, skuId: string, code: string, lineId?: string): Promise<void>;
}

/**
 * The order line a model is being resolved for. A store whose prints are
 * personalised (a name, the shopper's colour choices) has a different file for
 * every line, even two lines of the same SKU, and finds it with this.
 */
export interface X3dLineContext {
  orderId: string;
  /** The line's id, when the order's lines have ids. */
  lineId?: string;
  /** The line's position among the lines sent to X3D in this submit, from 0. */
  lineIndex: number;
  quantity: number;
}

export function createInMemoryX3dOrderStore(): X3dOrderStore {
  const byOrder = new Map<string, { code: string; skuIds: string[]; lineIds?: string[] }[]>();
  return {
    async list(orderId) {
      return (byOrder.get(orderId) ?? []).map((entry) => ({ code: entry.code, skuIds: [...entry.skuIds], ...(entry.lineIds ? { lineIds: [...entry.lineIds] } : {}) }));
    },
    async remember(orderId, skuId, code, lineId) {
      byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), { code, skuIds: [skuId], ...(lineId !== undefined ? { lineIds: [lineId] } : {}) }]);
    },
  };
}

/** An X3dOrderStore kept in @mercatus-liber/fulfillment's provider order links, so it survives a restart wherever those do. */
export function x3dOrderStoreFrom(links: ProviderOrderLinkRepository): X3dOrderStore {
  return {
    async list(orderId) {
      return (await links.listForOrder(orderId, X3D_PROVIDER)).map((link) => ({ code: link.externalOrderId, skuIds: link.skuIds, ...(link.lineIds ? { lineIds: link.lineIds } : {}) }));
    },
    async remember(orderId, skuId, code, lineId) {
      await links.link({ orderId, provider: X3D_PROVIDER, externalOrderId: code, skuIds: [skuId], ...(lineId !== undefined ? { lineIds: [lineId] } : {}) });
    },
  };
}

export interface X3dFulfillmentAdapterConfig {
  /** An X3D API key ("x3d_live_..."). Every order placed bills the card on file for that account. */
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /**
   * What a line prints as. For a product that is the same for every buyer,
   * look it up by SKU (see x3dCatalogTargetsFrom). For a personalised product,
   * use `line` to find that order line's own file.
   *
   * Throw when there is nothing to print yet (no mapping, or a personalised
   * line whose file has not been sliced). Every line is resolved before
   * anything is sent, so one line throwing stops the whole submit with nothing
   * ordered or charged.
   */
  resolveCatalogTarget(skuId: string, line: X3dLineContext): Promise<X3dCatalogTarget>;
  /**
   * Fetches a `fileUrl` target's bytes at order time. The default does a plain
   * GET of the URL. Supply this when the model sits behind authentication.
   */
  loadModel?(target: X3dCatalogTarget, skuId: string, line: X3dLineContext): Promise<Blob>;
  /**
   * Where placed orders are remembered. X3D has no idempotency key and no
   * endpoint to list orders, so this is the only thing that stops a retried
   * submit from printing and charging a line twice. The default is in memory
   * and forgets on restart; use x3dOrderStoreFrom with a durable repository.
   */
  orderStore?: X3dOrderStore;
  /**
   * X3D has no draft: an order sent is an order charged. With this set,
   * submitOrder sends nothing and reports each line as "held". Release the
   * order by submitting again with this unset.
   */
  holdOrders?: boolean;
  /** "express" is US only; an order going abroad is sent standard. Default "standard". */
  shippingSpeed?: X3dShippingSpeed;
  /**
   * Send the customer's own address to X3D, so X3D emails them its
   * confirmation, printed, shipped and delivered emails. Default false: the
   * customer hears from the store only.
   */
  emailCustomer?: boolean;
  /** Up to five addresses that get X3D's order emails. With none (and emailCustomer off), X3D emails the account's own address. */
  notifyEmails?: string[];
}

/** X3D accepted an order but the store could not remember it. The order exists and may be charged; record `code` by hand before retrying. */
export class X3dOrderNotRememberedError extends Error {
  constructor(
    readonly orderId: string,
    readonly skuId: string,
    readonly code: string,
    options: { cause: unknown },
  ) {
    super(`X3D Studios order ${code} was placed for order ${orderId}, SKU ${skuId}, but could not be stored. Record it before submitting this order again, or the line will be printed and charged twice.`, options);
    this.name = "X3dOrderNotRememberedError";
  }
}

/**
 * Placing a line's order failed. `placed` are the records of the lines that
 * were placed before it, in this call or an earlier one; they are remembered,
 * so submitting the order again places only what is missing.
 *
 * `outcomeUnknown` is true when the request got no answer at all (a network
 * failure or timeout). X3D may or may not have created and charged the order,
 * and it offers no way to look that up, so check the X3D account before
 * submitting again.
 */
export class X3dSubmitError extends Error {
  constructor(
    readonly orderId: string,
    readonly skuId: string,
    readonly placed: FulfillmentLineRecord[],
    readonly outcomeUnknown: boolean,
    options: { cause: unknown },
  ) {
    super(
      outcomeUnknown
        ? `Placing the X3D Studios order for order ${orderId}, SKU ${skuId} got no answer. It may have been created and charged; check the X3D account before submitting again.`
        : `Placing the X3D Studios order for order ${orderId}, SKU ${skuId} failed. ${placed.length} other line(s) of this order are placed and will not be placed again.`,
      options,
    );
    this.name = "X3dSubmitError";
  }
}

export interface X3dFulfillmentAdapter extends FulfillmentAdapter {
  /** Reads one X3D order by its code. null when X3D has no such order for this account. */
  getX3dOrder(code: string): Promise<X3dOrder | null>;
  /** What X3D returned when each order was placed by this instance, by code: the amount charged, the breakdown, the status page. */
  placedOrderDetails(code: string): X3dCreateOrderResponse | null;
}

/**
 * A FulfillmentAdapter that has X3D Studios print and ship orders.
 *
 * One X3D order prints one model, so a store order with three printed lines
 * becomes three X3D orders, each charged and shipped on its own (and each
 * paying postage unless it reaches X3D's free-shipping amount).
 *
 * `submitOrder` checks the address and every line's mapping before sending
 * anything. It then places the lines one at a time and remembers each as soon
 * as X3D accepts it. A line that already has a live X3D order is not placed
 * again; one whose order was cancelled or rejected is.
 *
 * An order X3D accepted but could not charge comes back unpaid. Its line is
 * reported "held", and X3D prints nothing until it is paid from the X3D
 * account.
 *
 * X3D sends no webhooks. Read status with `getOrderStatus`, or run
 * createX3dStatusPoller on a schedule.
 */
export function createX3dFulfillmentAdapter(config: X3dFulfillmentAdapterConfig): X3dFulfillmentAdapter {
  const client: X3dHttpClient = createX3dHttpClient({ apiKey: config.apiKey, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}), ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}) });
  const store = config.orderStore ?? createInMemoryX3dOrderStore();
  const placedDetails = new Map<string, X3dCreateOrderResponse>();
  const fetchImpl = config.fetchImpl ?? fetch;

  async function loadSource(target: X3dCatalogTarget, skuId: string, line: X3dLineContext): Promise<X3dModelSource> {
    if (target.modelUrl) return { modelUrl: target.modelUrl };
    const fileName = x3dFileNameFor(target)!;
    if (config.loadModel) return { file: await config.loadModel(target, skuId, line), fileName };
    const response = await fetchImpl(target.fileUrl!);
    if (!response.ok) throw new Error(`Could not fetch the model for SKU ${skuId}: HTTP ${response.status}`);
    return { file: await response.blob(), fileName };
  }

  // A line is known by its id when it has one, otherwise by its SKU. The two are
  // kept apart so a line id can never be mistaken for a SKU.
  const lineKey = (skuId: string, lineId: string | undefined): string => (lineId !== undefined ? `line:${lineId}` : `sku:${skuId}`);

  /** The newest live X3D order for each line, read back from X3D. A cancelled, rejected or vanished order does not count. */
  async function liveOrders(orderId: string): Promise<Map<string, X3dOrder>> {
    const live = new Map<string, X3dOrder>();
    for (const entry of await store.list(orderId)) {
      const order = await client.getOrder(entry.code);
      entry.skuIds.forEach((skuId, index) => {
        const key = lineKey(skuId, entry.lineIds?.[index]);
        if (order && mapX3dOrderStatus(order.status) !== "unfulfilled") live.set(key, order);
        else live.delete(key);
      });
    }
    return live;
  }

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      if (!input.recipient) throw new Error(`X3D Studios needs a shipping address; order ${input.orderId} has none.`);
      const address = mapRecipientToX3d(input.recipient);
      const lines = input.items.map((item, lineIndex): X3dLineContext => ({ orderId: input.orderId, ...(item.lineId !== undefined ? { lineId: item.lineId } : {}), lineIndex, quantity: item.quantity }));
      // Resolved per line, not per SKU: two lines of one SKU can be different prints.
      const targets: X3dCatalogTarget[] = [];
      for (const [index, item] of input.items.entries()) targets.push(await config.resolveCatalogTarget(item.skuId, lines[index]!));

      const held = (skuId: string, lineId: string | undefined): FulfillmentLineRecord => ({ orderId: input.orderId, skuId, ...(lineId !== undefined ? { lineId } : {}), provider: X3D_PROVIDER, externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null });
      const live = await liveOrders(input.orderId);
      const records: FulfillmentLineRecord[] = [];
      const emails = [...(config.emailCustomer && input.recipient.email ? [input.recipient.email] : []), ...(config.notifyEmails ?? [])].slice(0, 5);
      // Express is a US service; X3D refuses it for any other country.
      const shippingSpeed = config.shippingSpeed === "express" && address.country === "US" ? "express" : "standard";

      for (const [index, item] of input.items.entries()) {
        const lineIds = item.lineId !== undefined ? [item.lineId] : undefined;
        const existing = live.get(lineKey(item.skuId, item.lineId));
        if (existing) {
          records.push(...buildX3dLineRecords(input.orderId, [item.skuId], existing, lineIds));
          continue;
        }
        if (config.holdOrders) {
          records.push(held(item.skuId, item.lineId));
          continue;
        }

        const target = targets[index]!;
        const alreadyPlaced = (): FulfillmentLineRecord[] => records.filter((record) => record.externalOrderId);
        let source: X3dModelSource;
        try {
          source = await loadSource(target, item.skuId, lines[index]!);
        } catch (err) {
          // Nothing was sent to X3D.
          throw new X3dSubmitError(input.orderId, item.skuId, alreadyPlaced(), false, { cause: err });
        }
        let response: X3dCreateOrderResponse;
        try {
          response = await client.createOrder(
            {
              ...address,
              quantity: item.quantity,
              shippingSpeed,
              ...(target.material ? { material: target.material } : {}),
              ...(target.color ? { color: target.color } : {}),
              ...(target.quality ? { quality: target.quality } : {}),
              ...(target.infill !== undefined ? { infill: target.infill } : {}),
              ...(target.nozzleDiameter !== undefined ? { nozzleDiameter: target.nozzleDiameter } : {}),
              ...(target.layerHeight !== undefined ? { layerHeight: target.layerHeight } : {}),
              ...(target.note ? { note: target.note } : {}),
              ...(emails.length > 0 ? { emails } : {}),
            },
            source,
          );
        } catch (err) {
          // An error status means X3D answered and made no order. Anything else is a request with no answer.
          throw new X3dSubmitError(input.orderId, item.skuId, alreadyPlaced(), !(err instanceof X3dApiError), { cause: err });
        }

        placedDetails.set(response.code, response);
        try {
          await store.remember(input.orderId, item.skuId, response.code, item.lineId);
        } catch (err) {
          throw new X3dOrderNotRememberedError(input.orderId, item.skuId, response.code, { cause: err });
        }
        records.push(...buildX3dLineRecords(input.orderId, [item.skuId], { code: response.code, status: response.status }, lineIds));
      }
      return records;
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      // The newest order for a line wins, whatever its status, so a cancelled line reads as unfulfilled.
      const byLine = new Map<string, FulfillmentLineRecord>();
      for (const entry of await store.list(orderId)) {
        const order = await client.getOrder(entry.code);
        if (!order) continue;
        for (const record of buildX3dLineRecords(orderId, entry.skuIds, order, entry.lineIds)) byLine.set(lineKey(record.skuId, record.lineId), record);
      }
      return [...byLine.values()];
    },

    getX3dOrder: (code) => client.getOrder(code),
    placedOrderDetails: (code) => placedDetails.get(code) ?? null,
  };
}

/**
 * A `resolveCatalogTarget` that reads stored mappings (see
 * @mercatus-liber/fulfillment's ProviderCatalogMappingRepository) and checks
 * each is a usable X3dCatalogTarget.
 */
export function x3dCatalogTargetsFrom(repository: ProviderCatalogMappingRepository): (skuId: string) => Promise<X3dCatalogTarget> {
  return async (skuId) => {
    const parsed = parseX3dCatalogTarget(await requireCatalogTarget(repository, skuId, X3D_PROVIDER));
    if (!parsed.ok) throw new InvalidCatalogMappingError(skuId, X3D_PROVIDER, parsed.reason);
    return parsed.target;
  };
}

/** True when a target is the form X3D prints in several colours: an already-sliced `.gcode.3mf`. */
export function isX3dMulticolourTarget(target: X3dCatalogTarget): boolean {
  const fileName = x3dFileNameFor(target);
  return fileName !== null && isSlicedX3dFile(fileName);
}

export interface X3dPollResult {
  /** Open X3D orders read. */
  checked: number;
  /** Of those, how many had a new status or tracking number published. */
  published: number;
  /** Orders that could not be read or recorded. The rest were still processed. */
  failed: { code: string; error: unknown }[];
}

/**
 * X3D sends no webhooks, so this is how a store learns an order shipped. Each
 * `poll()` reads every X3D order that is not yet delivered, cancelled or
 * rejected and hands its status to `record` (normally
 * createProviderOrderStatusRecorder's `record`, bound to this provider), which
 * publishes `fulfillment.order.status_changed` when something changed.
 *
 * X3D suggests every five minutes while an order is in flight, and says
 * fifteen is fine once it is printing. Its order endpoints are not rate
 * limited.
 */
export function createX3dStatusPoller(deps: {
  getOrder(code: string): Promise<X3dOrder | null>;
  links: Pick<ProviderOrderLinkRepository, "listOpen">;
  record(update: ProviderOrderStatusUpdate): Promise<ProviderOrderStatusOutcome>;
}): { poll(): Promise<X3dPollResult> } {
  return {
    async poll() {
      const result: X3dPollResult = { checked: 0, published: 0, failed: [] };
      for (const link of await deps.links.listOpen(X3D_PROVIDER)) {
        try {
          const order = await deps.getOrder(link.externalOrderId);
          if (!order) continue;
          result.checked += 1;
          if ((await deps.record(x3dOrderStatusUpdateFrom(order))) === "published") result.published += 1;
        } catch (error) {
          result.failed.push({ code: link.externalOrderId, error });
        }
      }
      return result;
    },
  };
}
