"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { trackEvent } from "../lib/analytics-client";

/**
 * A marketing spot's link: records the spot as seen when it renders and as
 * clicked when followed, with its icid, placement and target, so the landing
 * page's own view event (which carries the same icid) can be tied back to it.
 */
export function TrackedLink({ href, icid, placement, target, children, style }: { href: string; icid: string; placement: string; target: string; children: ReactNode; style?: CSSProperties }) {
  useEffect(() => {
    trackEvent("spot_viewed", { icid, placement, target });
  }, [icid, placement, target]);
  return (
    <a href={href} style={style} onClick={() => trackEvent("spot_clicked", { icid, placement, target })}>
      {children}
    </a>
  );
}
