"use client";

import posthog from "posthog-js";

/**
 * Client-side collection: interaction/impression events that never touch the
 * backend at all (product viewed, search performed) -- distinct from the
 * cart/checkout/payment events the server-side subscriber forwards (see
 * @mercatus-liber/analytics's registerAnalyticsSync). Different event names
 * by construction is this repo's answer to the doc's dedup open question --
 * there's no overlap to deduplicate.
 *
 * Key-gated no-op fallback, same pattern as the server-side PostHog adapter's
 * empty-config fallback: no NEXT_PUBLIC_POSTHOG_KEY means this never touches
 * the network, safe to call unconditionally from any client component.
 */
let initialized = false;

function ensureInitialized(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;
  if (!initialized) {
    posthog.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com" });
    initialized = true;
  }
  return true;
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!ensureInitialized()) return;
  posthog.capture(eventName, properties);
}
