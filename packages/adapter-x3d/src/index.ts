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
import { aggregateX3dParts, isSlicedX3dFile, mapRecipientToX3d, parseX3dCatalogTarget, x3dFileNameFor, x3dOrderStatusUpdateFrom, x3dPartStateOf, type X3dCatalogTarget, type X3dPartState } from "./mapping.js";
import { X3D_PROVIDER } from "./provider.js";
import type { X3dCreateOrderResponse, X3dModelSource, X3dOrder, X3dShippingSpeed } from "./x3d-types.js";

export * from "./provider.js";
export * from "./x3d-types.js";
export * from "./http-client.js";
export * from "./mapping.js";

/** One X3D order the store placed: which line it is for, and which part of that line when the product prints as several. */
export interface X3dStoredOrder {
  code: string;
  skuIds: string[];
  lineIds?: string[];
  /** Set for a product that prints as several parts. */
  partId?: string;
  /** How many parts the line has in all, so a line with a part still missing can be told from a complete one. */
  partCount?: number;
  /** The last status stored for this order, when the store keeps one. Lets a poller skip reading orders that are finished. */
  status?: FulfillmentLineRecord["status"] | null;
  trackingNumber?: string | null;
  carrier?: string | null;
}

/** Which X3D order was placed for which line (and part) of which store order. */
export interface X3dOrderStore {
  /** A store order's X3D orders, oldest first. */
  list(orderId: string): Promise<X3dStoredOrder[]>;
  /** Called straight after X3D accepts an order, before anything else is sent. `lineId` is given when the order's lines have ids, `part` when the line prints as several parts. */
  remember(orderId: string, skuId: string, code: string, lineId?: string, part?: { partId: string; partCount: number }): Promise<void>;
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

/** One part of a product that prints as several: its own file, and a name that stays the same every time the line is resolved ("base", "lid"). */
export type X3dPartTarget = X3dCatalogTarget & { partId: string };

export function createInMemoryX3dOrderStore(): X3dOrderStore {
  const byOrder = new Map<string, X3dStoredOrder[]>();
  return {
    async list(orderId) {
      return (byOrder.get(orderId) ?? []).map((entry) => ({ ...entry, skuIds: [...entry.skuIds], ...(entry.lineIds ? { lineIds: [...entry.lineIds] } : {}) }));
    },
    async remember(orderId, skuId, code, lineId, part) {
      byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), { code, skuIds: [skuId], ...(lineId !== undefined ? { lineIds: [lineId] } : {}), ...(part ? { partId: part.partId, partCount: part.partCount } : {}) }]);
    },
  };
}

// A several-part line has one extra link of its own, under this made-up id. It
// holds the line's combined status, so the line's "shipped" is published once.
const LINE_LINK_PREFIX = "X3D-LINE:";
const isLineLink = (externalOrderId: string): boolean => externalOrderId.startsWith(LINE_LINK_PREFIX);

function storedOrderFrom(link: { externalOrderId: string; skuIds: string[]; lineIds?: string[]; meta?: Record<string, string>; status: FulfillmentLineRecord["status"] | null; trackingNumber: string | null; carrier: string | null }): X3dStoredOrder {
  const partCount = Number(link.meta?.partCount);
  return {
    code: link.externalOrderId,
    skuIds: link.skuIds,
    ...(link.lineIds ? { lineIds: link.lineIds } : {}),
    ...(link.meta?.partId !== undefined ? { partId: link.meta.partId, partCount: Number.isInteger(partCount) && partCount > 0 ? partCount : 1 } : {}),
    status: link.status,
    trackingNumber: link.trackingNumber,
    carrier: link.carrier,
  };
}

/** An X3dOrderStore kept in @mercatus-liber/fulfillment's provider order links, so it survives a restart wherever those do. */
export function x3dOrderStoreFrom(links: ProviderOrderLinkRepository): X3dOrderStore {
  return {
    async list(orderId) {
      return (await links.listForOrder(orderId, X3D_PROVIDER)).filter((link) => !isLineLink(link.externalOrderId)).map(storedOrderFrom);
    },
    async remember(orderId, skuId, code, lineId, part) {
      await links.link({
        orderId,
        provider: X3D_PROVIDER,
        externalOrderId: code,
        skuIds: [skuId],
        ...(lineId !== undefined ? { lineIds: [lineId] } : {}),
        ...(part ? { meta: { partId: part.partId, partCount: String(part.partCount) } } : {}),
      });
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
   * Return one target, or a list of parts for a product that prints as
   * several plates (a box and its lid). X3D prints one model per order, so
   * each part becomes its own X3D order, charged and posted separately. Give
   * each part a `partId` that is the same every time the line is resolved.
   *
   * Throw when there is nothing to print yet (no mapping, or a personalised
   * line whose file has not been sliced). Every part of every line is
   * resolved before anything is sent, so one throwing stops the whole submit
   * with nothing ordered or charged.
   */
  resolveCatalogTarget(skuId: string, line: X3dLineContext): Promise<X3dCatalogTarget | X3dPartTarget[]>;
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
 * paying postage unless it reaches X3D's free-shipping amount). A line whose
 * product prints as several parts becomes one X3D order per part, and still
 * reports as one line: "submitted" once every part is placed, "shipped" once
 * every part has shipped. A line with a part cancelled, rejected or never
 * placed reports "unfulfilled", so submitting the order again places just the
 * missing part.
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
  const unitKey = (skuId: string, lineId: string | undefined, partId: string | undefined): string => `${lineKey(skuId, lineId)}${partId !== undefined ? `|part:${partId}` : ""}`;

  /** The newest X3D order for each line part, read back from X3D. An order X3D no longer returns is left out. */
  async function newestOrders(orderId: string): Promise<{ byUnit: Map<string, X3dPartState>; lines: Map<string, { skuId: string; lineId?: string; partIds: Set<string>; partCount: number }> }> {
    const byUnit = new Map<string, X3dPartState>();
    const lines = new Map<string, { skuId: string; lineId?: string; partIds: Set<string>; partCount: number }>();
    for (const entry of await store.list(orderId)) {
      const order = await client.getOrder(entry.code);
      entry.skuIds.forEach((skuId, index) => {
        const lineId = entry.lineIds?.[index];
        const key = lineKey(skuId, lineId);
        const line = lines.get(key) ?? { skuId, ...(lineId !== undefined ? { lineId } : {}), partIds: new Set<string>(), partCount: 1 };
        if (entry.partId !== undefined) {
          line.partIds.add(entry.partId);
          line.partCount = Math.max(line.partCount, entry.partCount ?? 1);
        }
        lines.set(key, line);
        const unit = unitKey(skuId, lineId, entry.partId);
        if (order) byUnit.set(unit, x3dPartStateOf(order));
        else byUnit.delete(unit);
      });
    }
    return { byUnit, lines };
  }

  function lineRecord(orderId: string, skuId: string, lineId: string | undefined, parts: (X3dPartState | null)[]): FulfillmentLineRecord {
    const combined = aggregateX3dParts(parts);
    return {
      orderId,
      skuId,
      ...(lineId !== undefined ? { lineId } : {}),
      provider: X3D_PROVIDER,
      // A several-part line names every X3D order it has, comma-separated.
      externalOrderId: combined.codes.length > 0 ? combined.codes.join(",") : null,
      status: combined.status,
      trackingNumber: combined.trackingNumber,
      trackingUrl: null,
    };
  }

  function partsOf(skuId: string, resolved: X3dCatalogTarget | X3dPartTarget[]): { partId?: string; target: X3dCatalogTarget }[] {
    if (!Array.isArray(resolved)) return [{ target: resolved }];
    if (resolved.length === 0) throw new Error(`SKU ${skuId} resolved to an empty list of parts; there is nothing to print.`);
    const seen = new Set<string>();
    return resolved.map((part) => {
      if (typeof part.partId !== "string" || !part.partId) throw new Error(`SKU ${skuId}: every part needs a non-empty partId.`);
      if (seen.has(part.partId)) throw new Error(`SKU ${skuId}: partId "${part.partId}" is used twice.`);
      seen.add(part.partId);
      return { partId: part.partId, target: part };
    });
  }

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      if (!input.recipient) throw new Error(`X3D Studios needs a shipping address; order ${input.orderId} has none.`);
      const address = mapRecipientToX3d(input.recipient);
      const lines = input.items.map((item, lineIndex): X3dLineContext => ({ orderId: input.orderId, ...(item.lineId !== undefined ? { lineId: item.lineId } : {}), lineIndex, quantity: item.quantity }));
      // Resolved per line, not per SKU: two lines of one SKU can be different prints.
      const resolved: { partId?: string; target: X3dCatalogTarget }[][] = [];
      for (const [index, item] of input.items.entries()) resolved.push(partsOf(item.skuId, await config.resolveCatalogTarget(item.skuId, lines[index]!)));

      const { byUnit } = await newestOrders(input.orderId);
      const records: FulfillmentLineRecord[] = [];
      const emails = [...(config.emailCustomer && input.recipient.email ? [input.recipient.email] : []), ...(config.notifyEmails ?? [])].slice(0, 5);
      // Express is a US service; X3D refuses it for any other country.
      const shippingSpeed = config.shippingSpeed === "express" && address.country === "US" ? "express" : "standard";

      for (const [index, item] of input.items.entries()) {
        const parts = resolved[index]!;
        const states: (X3dPartState | null)[] = [];
        // What is placed so far, including the parts of this line placed before one failed.
        const placedSoFar = (): FulfillmentLineRecord[] => [...records, ...(states.some((state) => state !== null) ? [lineRecord(input.orderId, item.skuId, item.lineId, states)] : [])].filter((record) => record.externalOrderId);

        for (const part of parts) {
          const existing = byUnit.get(unitKey(item.skuId, item.lineId, part.partId));
          // A live order for this part is kept. One X3D cancelled or rejected is placed again.
          if (existing && existing.status !== "unfulfilled") {
            states.push(existing);
            continue;
          }
          if (config.holdOrders) {
            states.push(null);
            continue;
          }

          const target = part.target;
          let source: X3dModelSource;
          try {
            source = await loadSource(target, item.skuId, lines[index]!);
          } catch (err) {
            // Nothing was sent to X3D for this part.
            throw new X3dSubmitError(input.orderId, item.skuId, placedSoFar(), false, { cause: err });
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
            throw new X3dSubmitError(input.orderId, item.skuId, placedSoFar(), !(err instanceof X3dApiError), { cause: err });
          }

          placedDetails.set(response.code, response);
          try {
            await store.remember(input.orderId, item.skuId, response.code, item.lineId, part.partId !== undefined ? { partId: part.partId, partCount: parts.length } : undefined);
          } catch (err) {
            throw new X3dOrderNotRememberedError(input.orderId, item.skuId, response.code, { cause: err });
          }
          states.push(x3dPartStateOf({ code: response.code, status: response.status }));
        }
        records.push(lineRecord(input.orderId, item.skuId, item.lineId, states));
      }
      return records;
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      // The newest order for a part wins, whatever its status, so a cancelled one reads as unfulfilled.
      const { byUnit, lines } = await newestOrders(orderId);
      const records: FulfillmentLineRecord[] = [];
      for (const line of lines.values()) {
        if (line.partIds.size === 0) {
          const state = byUnit.get(unitKey(line.skuId, line.lineId, undefined));
          if (state) records.push(lineRecord(orderId, line.skuId, line.lineId, [state]));
          continue;
        }
        const states = [...line.partIds].map((partId) => byUnit.get(unitKey(line.skuId, line.lineId, partId))).filter((state): state is X3dPartState => state !== undefined);
        if (states.length === 0) continue;
        const record = lineRecord(orderId, line.skuId, line.lineId, states);
        // A part that was never placed leaves the line incomplete. It reads "unfulfilled" so the order is submitted again, which places only that part.
        records.push(states.length < line.partCount ? { ...record, status: "unfulfilled", trackingNumber: null } : record);
      }
      return records;
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
  /** How many status changes were published: one per single-order line that changed, one per several-part line whose combined status changed. */
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
 * A line made of several X3D orders is published as one line, under a link of
 * its own: its parts' statuses are stored quietly, and the line's change goes
 * out only when the combined status changes. So the buyer of a box and lid
 * hears "shipped" once, when the last of the two is in the post, with both
 * tracking numbers. A line with a part not yet placed publishes nothing.
 *
 * X3D suggests every five minutes while an order is in flight, and says
 * fifteen is fine once it is printing. Its order endpoints are not rate
 * limited.
 */
export function createX3dStatusPoller(deps: {
  getOrder(code: string): Promise<X3dOrder | null>;
  links: ProviderOrderLinkRepository;
  record(update: ProviderOrderStatusUpdate): Promise<ProviderOrderStatusOutcome>;
}): { poll(): Promise<X3dPollResult> } {
  const { links } = deps;
  return {
    async poll() {
      const result: X3dPollResult = { checked: 0, published: 0, failed: [] };
      // Several-part lines to work out once every open part has been read: "orderId, line" -> its order and line.
      const partLines = new Map<string, { orderId: string; skuId: string; lineId?: string }>();

      for (const link of await links.listOpen(X3D_PROVIDER)) {
        if (isLineLink(link.externalOrderId)) continue;
        try {
          const order = await deps.getOrder(link.externalOrderId);
          if (!order) continue;
          result.checked += 1;
          if (link.meta?.partId === undefined) {
            if ((await deps.record(x3dOrderStatusUpdateFrom(order))) === "published") result.published += 1;
            continue;
          }
          // A part: store what X3D says without publishing, and settle its line below.
          const state = x3dPartStateOf(order);
          await links.saveStatus(X3D_PROVIDER, link.externalOrderId, { status: state.status, trackingNumber: state.trackingNumber, carrier: state.carrier });
          const skuId = link.skuIds[0]!;
          const lineId = link.lineIds?.[0];
          partLines.set(JSON.stringify([link.orderId, skuId, lineId ?? null]), { orderId: link.orderId, skuId, ...(lineId !== undefined ? { lineId } : {}) });
        } catch (error) {
          result.failed.push({ code: link.externalOrderId, error });
        }
      }

      for (const line of partLines.values()) {
        const lineLinkId = `${LINE_LINK_PREFIX}${line.orderId}:${line.lineId ?? line.skuId}`;
        try {
          // The newest order per part, from what is stored (the open ones were refreshed just above).
          const newest = new Map<string, X3dStoredOrder>();
          let partCount = 1;
          for (const link of await links.listForOrder(line.orderId, X3D_PROVIDER)) {
            if (isLineLink(link.externalOrderId) || link.meta?.partId === undefined) continue;
            if (link.skuIds[0] !== line.skuId || link.lineIds?.[0] !== line.lineId) continue;
            const stored = storedOrderFrom(link);
            newest.set(stored.partId!, stored);
            partCount = Math.max(partCount, stored.partCount ?? 1);
          }
          // Not every part is placed, or one has no status yet: nothing to say about the line.
          if (newest.size < partCount || [...newest.values()].some((part) => !part.status)) continue;
          const combined = aggregateX3dParts([...newest.values()].map((part) => ({ code: part.code, status: part.status!, trackingNumber: part.trackingNumber ?? null, carrier: part.carrier ?? null })));
          await links.link({ orderId: line.orderId, provider: X3D_PROVIDER, externalOrderId: lineLinkId, skuIds: [line.skuId], ...(line.lineId !== undefined ? { lineIds: [line.lineId] } : {}) });
          if ((await deps.record({ externalOrderId: lineLinkId, status: combined.status, trackingNumber: combined.trackingNumber, carrier: combined.carrier })) === "published") result.published += 1;
        } catch (error) {
          result.failed.push({ code: lineLinkId, error });
        }
      }
      return result;
    },
  };
}
