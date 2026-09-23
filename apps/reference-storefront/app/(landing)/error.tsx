"use client";

import { useEffect } from "react";

/** Real error boundary for the framework landing page tree (including /sign-in) -- see app/demo/[demoSlug]/error.tsx's doc comment for why this exists. */
export default function LandingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  // bs-02-landing-page-brand: same inline-style brand-token pass as sign-in/page.tsx
  // (Carbon Ink #1A1A1D ink, Ledger Indigo #4338A0 for the primary retry CTA,
  // Public Sans loaded globally by the shared (landing) root layout).
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "'Public Sans', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#1a1a1d" }}>Something went wrong</h1>
      <p style={{ color: "#5a5a5e", fontSize: 14, marginBottom: 16 }}>
        This page hit a real error and couldn&apos;t finish loading.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            fontWeight: 600,
            background: "#4338a0",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a href="/" style={{ padding: "8px 14px", fontSize: 14, color: "#1a1a1d", alignSelf: "center" }}>
          &larr; Home
        </a>
      </div>
    </main>
  );
}
