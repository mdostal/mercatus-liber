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
