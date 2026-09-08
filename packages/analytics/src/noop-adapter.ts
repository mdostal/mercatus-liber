import type { AnalyticsAdapter } from "./types.js";

/**
 * Analytics disabled entirely -- for privacy-conscious deployments, or as the
 * documented fallback when no provider credentials are configured. Swapping
 * this in for createPostHogAdapter is a config change only; nothing else in
 * the system needs to change (docs/subsystems/13-analytics-tracking.md).
 */
export function createNoopAdapter(): AnalyticsAdapter {
  return {
    async track(): Promise<void> {},
    async identify(): Promise<void> {},
    async page(): Promise<void> {},
  };
}
