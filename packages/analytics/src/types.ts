/**
 * The shape most analytics SDKs (PostHog, Segment, Mixpanel, Amplitude, GA4)
 * already converge on -- wrapping any of them is a thin adapter, not a
 * redesign. See docs/subsystems/13-analytics-tracking.md.
 */
export interface AnalyticsAdapter {
  track(eventName: string, properties: Record<string, unknown>, context?: AnalyticsContext): Promise<void>;
  identify(userId: string, traits: Record<string, unknown>): Promise<void>;
  page(name: string, properties?: Record<string, unknown>): Promise<void>;
}

export interface AnalyticsContext {
  /** Present for a logged-in customer; omitted for anonymous/guest activity. */
  userId?: string;
}

/**
 * Read-side sibling to `AnalyticsAdapter` above -- a new, separate contract
 * (not an extension of `@mercatus-liber/internal-bi`'s `BiMetricsAdapter`),
 * per docs/design-discussion.md (analytics-insights-and-import-adapters) §1a:
 * traffic sources, page views, and referrers only ever exist inside an
 * external analytics provider's own system, never in this app's own
 * persistence, so this contract wraps *importing* that data back, as opposed
 * to `AnalyticsAdapter`'s job of pushing events *out*.
 */
export interface AnalyticsInsightsRange {
  /** Inclusive ISO 8601 date/datetime, e.g. "2026-08-01" or "2026-08-01T00:00:00Z". */
  from: string;
  /** Exclusive ISO 8601 date/datetime, same format as `from`. */
  to: string;
}

/**
 * Every row of every method below carries `provider` -- which configured
 * insights source (e.g. "posthog", "ga4", "internal-bi") answered it. This is
 * deliberately *not* named `source` on every row type: `getTrafficSources`
 * already has a domain-meaningful `source` field (e.g. "google", "direct",
 * "twitter.com"), and overloading that name with provider-attribution would
 * be actively confusing. `provider` is the "or equivalent" alternative to a
 * literal `source` field. This is required so a caller (story 2's admin
 * surface) can show every configured provider's numbers side by side,
 * explicitly labeled, never silently merged/summed -- see design-discussion.md
 * §1c: different tools count things differently (bot filtering, session
 * definitions, attribution windows), so a single blended number would
 * actively mislead.
 */
export interface ProviderAttributed {
  provider: string;
}

export interface TrafficSourceRow extends ProviderAttributed {
  source: string;
  sessions: number;
}

export interface PageViewRow extends ProviderAttributed {
  path: string;
  views: number;
}

export interface TopReferrerRow extends ProviderAttributed {
  referrer: string;
  count: number;
}

export interface AnalyticsInsightsAdapter {
  getTrafficSources(range: AnalyticsInsightsRange): Promise<TrafficSourceRow[]>;
  getPageViews(range: AnalyticsInsightsRange): Promise<PageViewRow[]>;
  getTopReferrers(range: AnalyticsInsightsRange): Promise<TopReferrerRow[]>;
}
