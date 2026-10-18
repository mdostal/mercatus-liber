import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** The header a receiver reads the signature from on every delivery this package makes. */
export const WEBHOOK_SIGNATURE_HEADER = "x-mercatus-liber-signature";
/** Which real event fired, so a receiver that subscribed to more than one type doesn't have to parse the body first to dispatch. */
export const WEBHOOK_EVENT_TYPE_HEADER = "x-mercatus-liber-event";
/** Correlates every retry attempt for the same logical delivery -- lets a receiver de-duplicate a webhook it already successfully processed once but received again after a false-negative response. */
export const WEBHOOK_DELIVERY_ID_HEADER = "x-mercatus-liber-delivery-id";

/**
 * Signs an outbound webhook body with the exact convention
 * adapter-printify's own `verifyPrintifySignature`
 * (packages/adapter-printify/src/webhook.ts) uses to verify an INBOUND
 * Printify webhook, applied in the outbound direction: HMAC-SHA256 over the
 * raw body bytes, using the secret directly as the HMAC key (no hex-decode
 * step -- that's Printful's convention, not Printify's; see
 * design-discussion.md §3 for why Printify's scheme, not Printful's, is the
 * one mirrored here), rendered as `sha256={hexdigest}`. Picking Printify's
 * exact format over Printful's means a receiver verifying this repo's own
 * outbound webhooks can reuse a Printify-webhook-verifier's logic almost
 * verbatim, and it avoids a hex-decode step for a secret this package itself
 * generates (there's no third-party dashboard dictating an encoding the way
 * Printful's `secret_key` response does).
 */
export function signWebhookPayload(secret: string, rawBody: string | Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * The receiver-side counterpart to signWebhookPayload -- exported so a
 * consumer of this package (or this package's own tests) can verify a
 * delivered webhook's authenticity exactly the way this repo already
 * expects Printful/Printify to be verified on the way in: constant-time
 * comparison, per Printify's own docs' explicit recommendation, reused
 * verbatim by verifyPrintifySignature/verifyPrintfulSignature already in
 * this repo.
 */
export function verifyWebhookSignature(secret: string, rawBody: string | Buffer, signatureHeader: string): boolean {
  const expected = signWebhookPayload(secret, rawBody);

  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(signatureHeader, "utf-8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/** A fresh random per-subscription secret -- used by createWebhookSubscription when the caller doesn't supply one. 32 bytes of CSPRNG output, hex-encoded (64 hex chars), the same size class as a typical provider-issued webhook secret (e.g. Printful's secret_key). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}
