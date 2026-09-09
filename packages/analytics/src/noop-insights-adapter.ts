import type { AnalyticsInsightsAdapter, PageViewRow, TopReferrerRow, TrafficSourceRow } from "./types.js";

/**
 * Insights disabled entirely -- the zero-infra default when no external
 * insights provider (PostHog Query API, GA4 Data API, ...) is configured.
 * Mirrors noop-adapter.ts's existing pattern for the write-side contract:
 * swapping this in for `createPostHogInsightsAdapter` is a config change
 * only, and every method resolves with real, valid, empty results and makes
 * zero external calls.
 */
export function createNoopInsightsAdapter(): AnalyticsInsightsAdapter {
  return {
    async getTrafficSources(): Promise<TrafficSourceRow[]> {
      return [];
    },
    async getPageViews(): Promise<PageViewRow[]> {
      return [];
    },
    async getTopReferrers(): Promise<TopReferrerRow[]> {
      return [];
    },
  };
}
