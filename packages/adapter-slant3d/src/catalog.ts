import { createSlant3dHttpClient, type Slant3dHttpClient } from "./http-client.js";
import { slant3dUsdToCents } from "./mapping.js";
import type { Slant3dFilament, Slant3dFile, Slant3dFileEstimate, Slant3dPlatform, Slant3dWebhookDeliveryResult } from "./slant3d-types.js";

export interface Slant3dCatalogClientConfig {
  apiKey: string;
  /** The platform files are uploaded to and webhooks are configured on. Only those calls need it. */
  platformId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Used instead of apiKey, baseUrl and fetchImpl when supplied. */
  httpClient?: Slant3dHttpClient;
}

/** What Slant would charge to print a file, in whole cents. Shipping is not included; it is only priced on a drafted order. */
export interface Slant3dEstimate {
  quantity: number;
  /** Slant's `total` for the whole quantity, surcharges included. */
  totalCents: number;
  /** Slant's `pricePerUnit`. */
  unitCents: number;
  /** Slant's `subtotal`, before surcharges. */
  subtotalCents: number;
  /** Always "USD": Slant prices in dollars only. */
  currency: "USD";
  raw: Slant3dFileEstimate;
}

/** Thrown when a webhook secret doesn't meet Slant's rules, before it is sent. */
export class InvalidSlant3dWebhookSecretError extends Error {
  constructor() {
    super("A Slant 3D webhook secret must be 32 to 256 printable ASCII characters with no spaces or line breaks.");
    this.name = "InvalidSlant3dWebhookSecretError";
  }
}

/** The setup and pricing side of selling prints through Slant. Nothing here creates an order. */
export interface Slant3dCatalogClient {
  /** Every material and colour Slant prints in, optionally filtered. `profile` is "PLA", "PETG" or "OPM"; `color` matches part of a colour name. */
  listFilaments(filter?: { profile?: string[]; color?: string[] }): Promise<Slant3dFilament[]>;
  /**
   * Uploads a model file in Slant's three steps: ask for an upload URL, PUT the
   * bytes to it, confirm. Returns the processed file; its publicFileServiceId
   * is what orders and estimates refer to.
   */
  uploadFile(input: { name: string; bytes: Uint8Array | ArrayBuffer; ownerId?: string; contentType?: string }): Promise<Slant3dFile>;
  /** Prices a file. Without a filament, Slant prices PLA Black; quantity defaults to 1. */
  estimate(input: { fileId: string; filamentId?: string; quantity?: number }): Promise<Slant3dEstimate>;
  listPlatforms(): Promise<Slant3dPlatform[]>;
  /** Creates a platform. An account can have 5 enabled platforms, and Slant requires the webhook URL to be a reachable HTTPS endpoint. */
  createPlatform(input: { name: string; url: string; description?: string; webhookURL?: string }): Promise<Slant3dPlatform>;
  /** The configured platform, or null if Slant has none with that id. */
  getPlatform(): Promise<Slant3dPlatform | null>;
  /** Sets where Slant sends this platform's webhooks. */
  setWebhookUrl(webhookURL: string): Promise<Slant3dPlatform>;
  /** The platform's current signing secret, or null if it has none. */
  getWebhookSecret(): Promise<string | null>;
  /** Sets a secret of your own. It replaces the old one at once, so deploy it to the adapter at the same time. */
  setWebhookSecret(webhookSecret: string): Promise<Slant3dPlatform>;
  /** Has Slant generate a new secret. The old one stops working at once. */
  rotateWebhookSecret(): Promise<Slant3dPlatform>;
  /** Sends a signed test order.shipped to the platform's webhook URL and reports what the endpoint answered. */
  sendTestWebhook(): Promise<Slant3dWebhookDeliveryResult>;
}

export function createSlant3dCatalogClient(config: Slant3dCatalogClientConfig): Slant3dCatalogClient {
  const http =
    config.httpClient ??
    createSlant3dHttpClient({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });

  function platformId(): string {
    if (!config.platformId) throw new Error("This call needs a Slant 3D platform id. Pass `platformId` to createSlant3dCatalogClient.");
    return config.platformId;
  }

  return {
    listFilaments: (filter) => http.listFilaments(filter),

    async uploadFile({ name, bytes, ownerId, contentType }) {
      const upload = await http.requestUpload({ name, platformId: platformId(), ...(ownerId !== undefined ? { ownerId } : {}) });
      // Slant's upload example sends the file's own type, or application/octet-stream when it has none.
      await http.putFile(upload.presignedUrl, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), contentType ?? "application/octet-stream");
      return http.confirmUpload(upload.filePlaceholder);
    },

    async estimate({ fileId, filamentId, quantity }) {
      const raw = await http.estimateFile(fileId, { ...(filamentId !== undefined ? { filamentId } : {}), ...(quantity !== undefined ? { quantity } : {}) });
      return {
        quantity: raw.quantity,
        totalCents: slant3dUsdToCents(raw.total),
        unitCents: slant3dUsdToCents(raw.pricePerUnit),
        subtotalCents: slant3dUsdToCents(raw.subtotal),
        currency: "USD",
        raw,
      };
    },

    listPlatforms: () => http.listPlatforms(),
    createPlatform: (input) => http.createPlatform(input),
    getPlatform: () => http.getPlatform(platformId()),
    setWebhookUrl: (webhookURL) => http.updatePlatform(platformId(), { webhookURL }),

    async getWebhookSecret() {
      return (await http.getPlatform(platformId()))?.webhookSecret ?? null;
    },

    async setWebhookSecret(webhookSecret) {
      if (!/^[!-~]{32,256}$/.test(webhookSecret)) throw new InvalidSlant3dWebhookSecretError();
      return http.updatePlatform(platformId(), { webhookSecret });
    },

    rotateWebhookSecret: () => http.rotateWebhookSecret(platformId()),
    sendTestWebhook: () => http.sendTestWebhook(platformId()),
  };
}
