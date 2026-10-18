import type { AccountingSyncAdapter, AccountingSyncProviderKey, SyncableOrder, SyncResult } from "@mercatus-liber/accounting-sync";
import { createQuickBooksHttpClient, type QuickBooksHttpClient } from "./http-client.js";
import { buildQuickBooksCreateRequest, type QuickBooksCustomerTarget, type QuickBooksItemTarget } from "./mapping.js";
import type { QuickBooksRecordType } from "./quickbooks-types.js";
import {
  parseQuickBooksWebhookPayload,
  QuickBooksWebhookSignatureInvalidError,
  QuickBooksWebhookVerifierNotConfiguredError,
  verifyQuickBooksSignature,
} from "./webhook.js";
import type { QuickBooksWebhookPayload } from "./quickbooks-types.js";

export * from "./quickbooks-types.js";
export * from "./mapping.js";
export { QuickBooksApiError, type QuickBooksHttpClient, type QuickBooksHttpClientConfig } from "./http-client.js";
export { refreshQuickBooksAccessToken, QUICKBOOKS_AUTHORIZE_URL, QUICKBOOKS_TOKEN_URL, QuickBooksOAuthError, type QuickBooksOAuthTokenSet } from "./oauth.js";
export {
  parseQuickBooksWebhookPayload,
  verifyQuickBooksSignature,
  QuickBooksWebhookPayloadParseError,
  QuickBooksWebhookSignatureInvalidError,
  QuickBooksWebhookVerifierNotConfiguredError,
} from "./webhook.js";

/** The provider key this adapter registers itself under in an AccountingSyncService (see @mercatus-liber/accounting-sync's own `provider` config field). */
export const QUICKBOOKS_PROVIDER: AccountingSyncProviderKey = "quickbooks";

export interface QuickBooksAccountingSyncAdapterConfig {
  /** QBO's own per-company id (quickbooks-types.ts's Research finding 2). */
  realmId: string;
  environment?: "production" | "sandbox";
  baseUrl?: string;
  minorVersion?: number;
  fetchImpl?: typeof fetch;
  accessToken?: string;
  oauth?: { clientId: string; clientSecret: string; refreshToken: string; tokenUrl?: string };
  onTokenRefreshed?(tokens: { accessToken: string; refreshToken: string }): void;
  /** Test/advanced-use injection point: bypasses every other HTTP-related field above when supplied. */
  httpClient?: QuickBooksHttpClient;

  /**
   * Which real QBO object to create per synced order -- defaults to
   * `"SalesReceipt"` (the correct object for an order this subsystem only
   * ever learns about once it's already paid in full -- see
   * quickbooks-types.ts's Research finding 4 for the real, documented
   * reasoning). `"Invoice"` is offered for a deployment that wants its own
   * Accounts-Receivable workflow in QuickBooks instead.
   */
  recordType?: QuickBooksRecordType;

  /**
   * Resolves an order to the real QuickBooks `Customer.Id` to bill. Required
   * because this reference app's own `customerId`/`shippingInfo` have no
   * built-in relationship to a QBO Customer record -- a real deployment
   * would look this up (or create-on-first-order) against its own customer
   * data, same shape of bridge as adapter-printful's `resolveRecipient`.
   */
  resolveCustomer(order: SyncableOrder): Promise<QuickBooksCustomerTarget>;

  /**
   * Resolves `skuId` to the real QuickBooks `Item.Id` a sales-receipt/invoice
   * line must reference. Required for the same reason
   * `PrintfulFulfillmentAdapterConfig.resolveCatalogTarget`/
   * `PrintifyFulfillmentAdapterConfig.resolveCatalogTarget` are: this
   * reference app's catalog has no notion of QuickBooks' own Item/Product
   * catalog at all.
   */
  resolveItem(skuId: string): Promise<QuickBooksItemTarget>;

  webhookVerifierToken?: string;
  /** Overrides the default `webhookVerifierToken`-based verifier entirely -- same escape hatch as adapter-printful's `verifyWebhookSignature`. */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;
  /** Invoked with the parsed, signature-verified webhook payload -- e.g. to detect a real operator voiding a synced SalesReceipt directly inside QuickBooks (quickbooks-types.ts's Research finding 5). Optional: a verified-but-unhandled webhook is not an error. */
  onWebhookEvent?(payload: QuickBooksWebhookPayload): void | Promise<void>;
}

/**
 * Real, deployable `AccountingSyncAdapter` (`@mercatus-liber/accounting-sync`,
 * epic `accounting-erp-sync-adapter`) implementation backed by QuickBooks
 * Online's real v3 Accounting API (see quickbooks-types.ts's top doc comment
 * for the full research record this implementation is grounded in).
 *
 * `syncOrder` -- resolves the order's customer and every line item's
 * QuickBooks `Item.Id` (both real, necessary caller bridges -- see this
 * config's own doc comments), builds the real `SalesReceipt` (or `Invoice`,
 * per `recordType`) create request body (mapping.ts), and POSTs it to
 * `/v3/company/{realmId}/salesreceipt` (or `/invoice`). The created entity's
 * real `Id` becomes this call's `SyncResult.externalId`.
 *
 * `handleWebhookEvent` -- real signature verification plus payload parsing
 * for QuickBooks' real, documented webhook delivery shape, gated behind a
 * caller-supplied verifier (fails closed with
 * `QuickBooksWebhookVerifierNotConfiguredError` otherwise, same posture as
 * adapter-printful's `PrintfulWebhookSignatureUnconfirmedError`).
 *
 * No real QuickBooks Online account/credentials exist in this environment
 * (per this epic's own explicit instruction and this repo's established
 * "Real credential gate" disclosure, same posture as epics 27/42/43/46) --
 * this adapter is built and unit-tested for real correctness against
 * QuickBooks' actual, documented API shape, not exercised against a live
 * QuickBooks account in this environment.
 */
export function createQuickBooksAccountingSyncAdapter(config: QuickBooksAccountingSyncAdapterConfig): AccountingSyncAdapter {
  const client =
    config.httpClient ??
    createQuickBooksHttpClient({
      realmId: config.realmId,
      ...(config.environment !== undefined ? { environment: config.environment } : {}),
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.minorVersion !== undefined ? { minorVersion: config.minorVersion } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.accessToken !== undefined ? { accessToken: config.accessToken } : {}),
      ...(config.oauth !== undefined ? { oauth: config.oauth } : {}),
      ...(config.onTokenRefreshed !== undefined ? { onTokenRefreshed: config.onTokenRefreshed } : {}),
    });
  const recordType: QuickBooksRecordType = config.recordType ?? "SalesReceipt";

  return {
    async syncOrder(order: SyncableOrder): Promise<SyncResult> {
      const customerTarget = await config.resolveCustomer(order);

      const itemTargets = new Map<string, QuickBooksItemTarget>();
      for (const item of order.items) {
        itemTargets.set(item.skuId, await config.resolveItem(item.skuId));
      }

      const request = buildQuickBooksCreateRequest(order, customerTarget, itemTargets);
      const entity = await client.createSalesEntity(recordType, request);

      return {
        externalId: entity.Id,
        syncedAt: new Date().toISOString(),
      };
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let isValid: boolean;
      if (config.verifyWebhookSignature) {
        isValid = await config.verifyWebhookSignature(rawBody, signature);
      } else if (config.webhookVerifierToken) {
        isValid = verifyQuickBooksSignature(config.webhookVerifierToken, rawBody, signature);
      } else {
        throw new QuickBooksWebhookVerifierNotConfiguredError();
      }
      if (!isValid) {
        throw new QuickBooksWebhookSignatureInvalidError();
      }

      const payload = parseQuickBooksWebhookPayload(rawBody);
      await config.onWebhookEvent?.(payload);
    },
  };
}
