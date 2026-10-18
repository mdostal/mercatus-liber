import { createHmac, timingSafeEqual } from "node:crypto";
import type { QuickBooksWebhookPayload } from "./quickbooks-types.js";

export class QuickBooksWebhookVerifierNotConfiguredError extends Error {
  constructor() {
    super(
      "No QuickBooks webhook verifier configured -- refusing to process an unverified webhook payload. " +
        "QuickBooks Online's real webhook signature scheme (quickbooks-types.ts's Research finding 5) uses " +
        "HMAC-SHA256 over the raw request body with your app's own Verifier Token (from the Intuit developer " +
        "dashboard) as the key, base64-encoded, compared against the `intuit-signature` header -- supply it " +
        "as `webhookVerifierToken`, or supply a custom `verifyWebhookSignature`, in " +
        "QuickBooksAccountingSyncAdapterConfig.",
    );
    this.name = "QuickBooksWebhookVerifierNotConfiguredError";
  }
}

export class QuickBooksWebhookSignatureInvalidError extends Error {
  constructor() {
    super("QuickBooks webhook signature verification failed -- refusing to process the payload.");
    this.name = "QuickBooksWebhookSignatureInvalidError";
  }
}

export class QuickBooksWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`QuickBooks webhook payload is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "QuickBooksWebhookPayloadParseError";
  }
}

/**
 * Real QuickBooks Online webhook signature verification (quickbooks-types.ts's
 * Research finding 5): HMAC-SHA256 over the raw body using the app's own
 * Verifier Token as the key, base64-digest, compared against the real
 * `intuit-signature` header. Constant-time comparison, same discipline as
 * `@mercatus-liber/adapter-printful`'s `verifyPrintfulSignature`/
 * `@mercatus-liber/adapter-printify`'s `verifyPrintifySignature`.
 */
export function verifyQuickBooksSignature(verifierToken: string, rawBody: string | Buffer, signatureHeaderBase64: string): boolean {
  const expected = createHmac("sha256", verifierToken).update(rawBody).digest("base64");

  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(signatureHeaderBase64, "utf-8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function parseQuickBooksWebhookPayload(rawBody: string | Buffer): QuickBooksWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new QuickBooksWebhookPayloadParseError(err);
  }

  const payload = parsed as Partial<QuickBooksWebhookPayload>;
  if (!Array.isArray(payload.eventNotifications)) {
    throw new QuickBooksWebhookPayloadParseError(new Error('missing or non-array "eventNotifications" field'));
  }
  return payload as QuickBooksWebhookPayload;
}
