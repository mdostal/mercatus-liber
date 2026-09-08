import { PostHog } from "posthog-node";
import type { AnalyticsAdapter, AnalyticsContext } from "./types.js";

export interface PostHogAdapterConfig {
  apiKey: string;
  host?: string;
}

const ANONYMOUS_DISTINCT_ID = "anonymous";

/**
 * PostHog reference adapter -- the shipped-by-default provider per the
 * founder's spec ("by default roll posthog"). Wraps posthog-node's client,
 * constructed here (not injected) so callers never see the SDK type, mirroring
 * @mercatus-liber/payments' Stripe adapter pattern.
 */
export function createPostHogAdapter(config: PostHogAdapterConfig): AnalyticsAdapter {
  const client = new PostHog(config.apiKey, config.host ? { host: config.host } : undefined);

  return {
    async track(eventName: string, properties: Record<string, unknown>, context?: AnalyticsContext): Promise<void> {
      client.capture({
        distinctId: context?.userId ?? ANONYMOUS_DISTINCT_ID,
        event: eventName,
        properties,
      });
    },

    async identify(userId: string, traits: Record<string, unknown>): Promise<void> {
      client.identify({ distinctId: userId, properties: traits });
    },

    async page(name: string, properties?: Record<string, unknown>): Promise<void> {
      client.capture({
        distinctId: ANONYMOUS_DISTINCT_ID,
        event: "$pageview",
        properties: { ...properties, page: name },
      });
    },
  };
}
