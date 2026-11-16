/**
 * Status webhooks from print-on-demand providers (Printful, Slant 3D, 3DAPI), received at
 * POST /api/demo/<demoSlug>/fulfillment/<provider>/webhook.
 *
 * Each provider's adapter verifies the signature and parses the body
 * (`handleWebhookEvent`); a verified event is published on the store's event
 * bus as `fulfillment.provider_event`, so anything that cares (order emails,
 * an admin view, a sync job) subscribes instead of this route knowing about it.
 * A provider is only listed here when its webhook secret is configured.
 */
import {
  DapiWebhookPayloadParseError,
  DapiWebhookSignatureInvalidError,
  DapiWebhookSignatureNotConfiguredError,
  DapiWebhookTimestampError,
  dapiWebhookSignatureFromHeaders,
} from "@mercatus-liber/adapter-3dapi";
import {
  PrintfulWebhookPayloadParseError,
  PrintfulWebhookSignatureInvalidError,
  PrintfulWebhookSignatureUnconfirmedError,
  printfulWebhookSignatureFrom,
} from "@mercatus-liber/adapter-printful";
import {
  Slant3dWebhookPayloadParseError,
  Slant3dWebhookSignatureInvalidError,
  Slant3dWebhookSignatureNotConfiguredError,
  slant3dWebhookSignatureFrom,
} from "@mercatus-liber/adapter-slant3d";

export const FULFILLMENT_PROVIDER_EVENT = "fulfillment.provider_event";

export interface FulfillmentProviderEvent {
  provider: string;
  event: unknown;
}

export interface FulfillmentWebhookReceiver {
  signatureFrom(headers: Headers): string;
  handle(rawBody: string, signature: string): Promise<void>;
}

export type FulfillmentWebhookReceivers = Record<string, FulfillmentWebhookReceiver>;

export const slant3dSignatureFrom = (headers: Headers): string => slant3dWebhookSignatureFrom(headers);
export const dapiSignatureFrom = (headers: Headers): string => dapiWebhookSignatureFromHeaders(headers);
export const printfulSignatureFrom = (headers: Headers): string => printfulWebhookSignatureFrom(headers);

const UNAUTHORIZED = [
  PrintfulWebhookSignatureInvalidError,
  PrintfulWebhookSignatureUnconfirmedError,
  Slant3dWebhookSignatureInvalidError,
  Slant3dWebhookSignatureNotConfiguredError,
  DapiWebhookSignatureInvalidError,
  DapiWebhookSignatureNotConfiguredError,
  DapiWebhookTimestampError,
];
const BAD_BODY = [PrintfulWebhookPayloadParseError, Slant3dWebhookPayloadParseError, DapiWebhookPayloadParseError];

export interface WebhookOutcome {
  status: number;
  body: { received: true } | { error: string };
}

/** Routes one delivery to its provider's receiver and maps the result to an HTTP status. Never echoes the body. */
export async function receiveFulfillmentWebhook(receivers: FulfillmentWebhookReceivers, provider: string, headers: Headers, rawBody: string): Promise<WebhookOutcome> {
  const receiver = Object.hasOwn(receivers, provider) ? receivers[provider] : undefined;
  if (!receiver) return { status: 404, body: { error: "unknown_provider" } };

  let signature: string;
  try {
    signature = receiver.signatureFrom(headers);
  } catch {
    return { status: 401, body: { error: "missing_signature" } };
  }
  if (!signature) return { status: 401, body: { error: "missing_signature" } };

  try {
    await receiver.handle(rawBody, signature);
  } catch (err) {
    if (UNAUTHORIZED.some((cls) => err instanceof cls)) return { status: 401, body: { error: "invalid_signature" } };
    if (BAD_BODY.some((cls) => err instanceof cls)) return { status: 400, body: { error: "invalid_body" } };
    // Anything else is ours: a non-2xx makes the provider retry.
    return { status: 500, body: { error: "handler_failed" } };
  }
  return { status: 200, body: { received: true } };
}
