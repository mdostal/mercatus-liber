"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Real error boundary for every /demo/[demoSlug]/* route -- found missing
 * during a post-deployment audit. Without this, an unhandled error anywhere
 * in this tree (most commonly checkout with no STRIPE_SECRET_KEY configured,
 * this framework's default zero-config state) rendered Next.js's raw crash
 * page, stack trace and all, to a real shopper. This never changes WHETHER
 * checkout fails without a Stripe key (that's the framework's intentional
 * "fail loudly, don't silently pretend to succeed" posture) -- only how that
 * failure looks to the person who hit it.
 */
export default function DemoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const demoSlug = pathname?.split("/")[2] ?? "";

  useEffect(() => {
    // eslint-disable-next-line no-console -- real server errors still belong in the server/browser console, just not on the page itself.
    console.error(error);
  }, [error]);

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 4 }}>
        This page hit a real error and couldn&apos;t finish loading.
      </p>
      {error.message?.toLowerCase().includes("apikey") || error.message?.toLowerCase().includes("stripe") ? (
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          This demo deployment doesn&apos;t have a Stripe key configured yet, so checkout can&apos;t complete --
          that&apos;s expected for an unconfigured deployment, not a bug in your cart.
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
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
        {demoSlug ? (
          <a
            href={`/demo/${demoSlug}`}
            style={{ padding: "8px 14px", fontSize: 14, color: "#1c1917", alignSelf: "center" }}
          >
            &larr; Back to shop
          </a>
        ) : null}
      </div>
    </main>
  );
}
