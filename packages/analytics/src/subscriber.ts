import type { EventBus } from "@mercatus-liber/core";
import { ANALYTICS_EVENT_MAP } from "./event-map.js";
import type { AnalyticsAdapter } from "./types.js";

/**
 * The entire server-side collection mechanism: subscribe to every allow-listed
 * bus topic and forward its payload as track() properties, verbatim. No
 * subsystem is touched to add this -- it only ever subscribes, per
 * docs/subsystems/13-analytics-tracking.md's decoupling notes. A bus event not
 * in ANALYTICS_EVENT_MAP is silently not forwarded -- that is the allow-list
 * working as designed, not a bug.
 */
export function registerAnalyticsSync(deps: { events: EventBus; analytics: AnalyticsAdapter }): void {
  const { events, analytics } = deps;

  for (const [busTopic, analyticsEventName] of Object.entries(ANALYTICS_EVENT_MAP)) {
    events.subscribe<Record<string, unknown>>(busTopic, async (payload) => {
      await analytics.track(analyticsEventName, payload);
    });
  }
}
