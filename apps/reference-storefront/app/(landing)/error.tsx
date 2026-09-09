"use client";

import { useEffect } from "react";

/** Real error boundary for the framework landing page tree (including /sign-in) -- see app/demo/[demoSlug]/error.tsx's doc comment for why this exists. */
export default function LandingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
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
            background: "#1c1917",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a href="/" style={{ padding: "8px 14px", fontSize: 14, color: "#1c1917", alignSelf: "center" }}>
          &larr; Home
        </a>
      </div>
    </main>
  );
}
