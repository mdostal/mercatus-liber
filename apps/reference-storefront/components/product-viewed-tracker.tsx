"use client";

import { useEffect } from "react";
import { trackEvent } from "../lib/analytics-client";

/**
 * Fires a client-side product-viewed interaction event on PDP mount -- the
 * concrete proof of docs/subsystems/13-analytics-tracking.md's "client and
 * server paths both terminate at the same AnalyticsAdapter interface" design.
 * Renders nothing; the PDP's own async Server Component can't attach this
 * effect itself, so it's extracted here (same reason theme-switcher.tsx is
 * its own client component).
 */
export function ProductViewedTracker({ productId, slug }: { productId: string; slug: string }) {
  useEffect(() => {
    trackEvent("product_viewed", { productId, slug });
  }, [productId, slug]);

  return null;
}
