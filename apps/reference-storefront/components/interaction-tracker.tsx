"use client";

import { useEffect } from "react";
import { trackEvent } from "../lib/analytics-client";

/**
 * Generalized client-side interaction tracker (epic commerce-gap-audit's
 * fix -- product-viewed-tracker.tsx covered only PDP; this covers any page
 * with a meaningful shopper interaction that never touches the backend,
 * per docs/subsystems/13-analytics-tracking.md's client/server split).
 * Renders nothing; Server Components can't attach effects directly, so
 * this is its own "use client" component, same reason theme-switcher.tsx
 * is one.
 */
export function InteractionTracker({ eventName, properties }: { eventName: string; properties?: Record<string, unknown> }) {
  // Depend on the serialized value, not the object reference -- properties
  // is a fresh object literal every render, which would otherwise re-fire
  // the effect on every render instead of once per real change.
  const propertiesKey = properties ? JSON.stringify(properties) : undefined;

  useEffect(() => {
    trackEvent(eventName, properties);
  }, [eventName, propertiesKey]);

  return null;
}
