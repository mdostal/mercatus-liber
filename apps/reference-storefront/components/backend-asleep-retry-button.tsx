"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * free-tier-resilience-and-keepalive epic (fr-01): the one interactive bit
 * of components/backend-asleep-page.tsx, isolated to its own "use client"
 * file -- Next's "use client" directive applies to a whole file, and
 * BackendAsleepPage itself needs to stay a plain Server Component so it can
 * return the full `<html><body>` root app/demo/[demoSlug]/layout.tsx needs
 * (that layout IS this route group's root layout, same reason it already
 * builds its own `<html>` today -- see that file's own doc comment). The
 * visible label is taken as `children` (not hardcoded here) so the real
 * copy a visitor sees lives in BackendAsleepPage's own tree -- directly
 * walkable by a plain-function test, the same "call the component, flatten
 * the returned element tree" pattern test/landing-page.test.ts already
 * established -- without needing to execute this component's hooks outside
 * React.
 */
export function BackendAsleepRetryButton({ children }: { children: ReactNode }) {
  const [retrying, setRetrying] = useState(false);

  return (
    <button
      type="button"
      disabled={retrying}
      onClick={() => {
        setRetrying(true);
        window.location.reload();
      }}
      style={{
        padding: "10px 18px",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "inherit",
        background: "#4338A0",
        color: "#fff",
        border: "none",
        borderRadius: 4,
        cursor: retrying ? "default" : "pointer",
        opacity: retrying ? 0.7 : 1,
      }}
    >
      {retrying ? "Trying again…" : children}
    </button>
  );
}
