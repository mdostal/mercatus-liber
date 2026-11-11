import { createDapiHttpClient, DapiApiError, type DapiHttpClient } from "./http-client.js";
import type { DapiActor, DapiList, DapiMaterial, DapiOrderLineExtra, DapiQuote, DapiShippingEstimate, DapiUpload, DapiWallet } from "./dapi-types.js";

/**
 * The pricing side of selling prints through 3DAPI: the material catalog,
 * uploading a model file and quoting it, shipping estimates, and the wallet
 * balance. Nothing here places an order.
 */
export interface DapiCatalogClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Replaces the client built from the fields above, except for the file PUT in `uploadFile`, which always uses `fetchImpl`. */
  httpClient?: DapiHttpClient;
}

/** Thrown by `uploadFile` when the storage PUT is refused. The PUT goes to storage, not to 3DAPI's API, so there is no 3DAPI error code. */
export class DapiUploadError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Sending the file to 3DAPI's upload URL failed with HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "DapiUploadError";
  }
}

/** Thrown by `waitForQuote` when the quote ends `failed`, or is still `processing` at the timeout. */
export class DapiQuoteNotReadyError extends Error {
  constructor(
    readonly quote: DapiQuote,
    reason: string,
  ) {
    super(`3DAPI quote ${quote.id} is not ready: ${reason}`);
    this.name = "DapiQuoteNotReadyError";
  }
}

export interface DapiQuotedFile {
  quote: DapiQuote;
  /** The production price of one unit, in cents. Larger quantities cost less per unit, and shipping is extra. */
  unitCostCents: number;
  /** 3DAPI's currency code, lowercase ("usd"). */
  currency: string;
}

export interface DapiShippingEstimateResult {
  /** What the order would be charged for shipping, in cents, without VAT. */
  totalCents: number;
  currency: string;
  estimate: DapiShippingEstimate;
}

export interface DapiCatalogClient {
  /** GET /v2/me. Use it to check a key: `kind` should be "integrator" and `approval` "approved" before ordering. */
  whoAmI(): Promise<DapiActor>;
  /** GET /v2/materials, every page. 3DAPI documents it as public, so no API key is sent. */
  listMaterials(): Promise<DapiMaterial[]>;
  /** POST /v2/uploads with purpose `quote_file`: reserves a slot and says where to PUT the bytes. */
  createUpload(input: { fileName: string; contentType: string; sizeBytes: number; idempotencyKey?: string }): Promise<DapiUpload>;
  /** Reserves a slot and PUTs the bytes to it. Returns the upload, whose `id` works in one quote and expires after 24 hours. */
  uploadFile(input: { fileName: string; contentType: string; bytes: Uint8Array; idempotencyKey?: string }): Promise<DapiUpload>;
  /** POST /v2/quotes. The quote comes back `processing`; poll `getQuote` or use `waitForQuote`. */
  createQuote(input: { uploadId: string; name?: string; idempotencyKey?: string }): Promise<DapiQuote>;
  /** GET /v2/quotes/{id}. null when 3DAPI answers 404 `quote_not_found`. */
  getQuote(id: string): Promise<DapiQuote | null>;
  /** Polls a quote until it is `ready`. Throws DapiQuoteNotReadyError if it fails or the timeout passes. */
  waitForQuote(id: string, options?: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<DapiQuotedFile>;
  /** Uploads a file, quotes it and waits for the price. */
  quoteFile(input: { fileName: string; contentType: string; bytes: Uint8Array; name?: string }, options?: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<DapiQuotedFile>;
  /** POST /v2/integrator/orders/shipping-estimate. Creates nothing. `country` is ISO alpha-2. */
  estimateShipping(input: { country: string; items: { quoteId: string; quantity: number; extras?: { extra: string; quantityPerUnit: number }[] }[] }): Promise<DapiShippingEstimateResult>;
  /** GET /v2/wallet: balance, sample credit and pending withdrawals. Needs the `wallet:read` scope. */
  getWallet(): Promise<DapiWallet>;
}

/** The unit price of a ready quote in cents. Throws when the quote has no price yet. */
export function dapiQuoteUnitCostCents(quote: DapiQuote): number {
  if (quote.status !== "ready" || !quote.price) throw new DapiQuoteNotReadyError(quote, quote.status === "failed" ? (quote.failure_reason ?? "slicing failed") : `status is ${quote.status}`);
  return quote.price.amount;
}

export function createDapiCatalogClient(config: DapiCatalogClientConfig): DapiCatalogClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const http =
    config.httpClient ??
    createDapiHttpClient({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });

  const client: DapiCatalogClient = {
    whoAmI() {
      return http.request<DapiActor>("GET", "/v2/me");
    },

    async listMaterials() {
      const materials: DapiMaterial[] = [];
      let cursor: string | undefined;
      do {
        const page: DapiList<DapiMaterial> = await http.request<DapiList<DapiMaterial>>("GET", "/v2/materials", { query: { limit: 100, cursor }, auth: false });
        materials.push(...page.data);
        cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
      } while (cursor);
      return materials;
    },

    createUpload(input) {
      return http.request<DapiUpload>("POST", "/v2/uploads", {
        body: { purpose: "quote_file", file_name: input.fileName, content_type: input.contentType, size_bytes: input.sizeBytes },
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      });
    },

    async uploadFile(input) {
      const upload = await client.createUpload({
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      });
      // The spec says to send the bytes "with `method` and `headers` exactly as
      // given" and does not say what a successful PUT returns, so any 2xx counts.
      const response = await fetchImpl(upload.upload_url, { method: upload.method, headers: upload.headers, body: input.bytes });
      if (!response.ok) throw new DapiUploadError(response.status, await response.text());
      return upload;
    },

    createQuote(input) {
      return http.request<DapiQuote>("POST", "/v2/quotes", {
        body: { file: { upload: input.uploadId }, ...(input.name !== undefined ? { name: input.name } : {}) },
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      });
    },

    async getQuote(id) {
      try {
        return await http.request<DapiQuote>("GET", `/v2/quotes/${encodeURIComponent(id)}`);
      } catch (err) {
        if (err instanceof DapiApiError && err.status === 404) return null;
        throw err;
      }
    },

    async waitForQuote(id, options = {}) {
      // 3DAPI: slicing "usually takes one to a few minutes" and polling "every few seconds is enough".
      const intervalMs = options.intervalMs ?? 3000;
      const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
      const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      for (let waited = 0; ; waited += intervalMs) {
        const quote = await http.request<DapiQuote>("GET", `/v2/quotes/${encodeURIComponent(id)}`);
        if (quote.status === "ready" && quote.price) return { quote, unitCostCents: quote.price.amount, currency: quote.price.currency };
        if (quote.status === "failed") throw new DapiQuoteNotReadyError(quote, quote.failure_reason ?? "slicing failed");
        if (waited >= timeoutMs) throw new DapiQuoteNotReadyError(quote, `still ${quote.status} after ${timeoutMs} ms`);
        await sleep(intervalMs);
      }
    },

    async quoteFile(input, options) {
      const upload = await client.uploadFile({ fileName: input.fileName, contentType: input.contentType, bytes: input.bytes });
      const quote = await client.createQuote({ uploadId: upload.id, ...(input.name !== undefined ? { name: input.name } : {}) });
      return client.waitForQuote(quote.id, options);
    },

    async estimateShipping(input) {
      const estimate = await http.request<DapiShippingEstimate>("POST", "/v2/integrator/orders/shipping-estimate", {
        body: {
          country: input.country.trim().toUpperCase(),
          items: input.items.map((item) => {
            const extras: DapiOrderLineExtra[] | undefined = item.extras?.map((e) => ({ extra: e.extra, quantity_per_unit: e.quantityPerUnit }));
            return { quote: item.quoteId, quantity: item.quantity, ...(extras && extras.length > 0 ? { extras } : {}) };
          }),
        },
      });
      return { totalCents: estimate.total.amount, currency: estimate.total.currency, estimate };
    },

    getWallet() {
      return http.request<DapiWallet>("GET", "/v2/wallet");
    },
  };
  return client;
}
