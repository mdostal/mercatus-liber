import { BackendAsleepRetryButton } from "./backend-asleep-retry-button";

/**
 * Same Google Fonts request app/(landing)/layout.tsx already loads for the
 * framework's own brand chrome (Public Sans + JetBrains Mono, per
 * .pHive/brand/brand-system.yaml) -- reused verbatim here, not re-derived,
 * so this page's type matches the rest of the framework-level (not
 * demo-theme) surfaces byte-for-byte.
 */
const BRAND_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

/**
 * free-tier-resilience-and-keepalive epic (fr-01): rendered by
 * app/demo/[demoSlug]/layout.tsx IN PLACE OF its normal `<html><body>` --
 * not nested inside it -- the moment `readOrBackendUnreachable`
 * (lib/backend-unreachable.ts) reports the one real, verified "the catalog
 * persistence backend itself is unreachable" shape. See that module's own
 * doc comment for exactly which two error shapes trigger this and why
 * every other error must keep crashing exactly as before.
 *
 * Real, honest copy, per .pHive/brand/brand-system.yaml's own
 * voice_principles ("Say what's actually true, including the pre-alpha
 * parts and the parts that don't work yet -- credibility comes from
 * precision, not polish"): this never claims the backend IS already waking
 * up on its own (no automated wake attempt runs from this page -- that's
 * the separate fr-03 keep-alive cron story), only that it MAY be asleep
 * from inactivity and that a manual retry is worth trying, with an honest
 * disclosure that a free, open-source demo isn't held to the same uptime
 * bar a paid deployment would be.
 *
 * Deliberately framework-level chrome (Ledger Indigo / Carbon Ink / Paper
 * Neutral, Public Sans + JetBrains Mono) rather than any one demo store's
 * own theme bundle -- this is an infrastructure state, not storefront
 * content, the same register app/(landing)/layout.tsx's own brand chrome
 * uses, and it has to render even when the per-demo ThemingService itself
 * couldn't be reached.
 *
 * A plain, synchronous function component (no hooks, no data fetching) --
 * callable directly and walked without a DOM renderer, same shape
 * test/landing-page.test.ts already uses for LandingPage/LandingRootLayout.
 */
export default function BackendAsleepPage({ demoSlug }: { demoSlug: string }) {
  return (
    <html lang="en">
      <head>
        <title>This demo may be asleep</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={BRAND_FONTS_HREF} />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#F3F3F1",
          color: "#1A1A1D",
          fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            border: "1px solid rgba(26, 26, 29, 0.14)",
            borderRadius: 8,
            padding: 32,
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#4338A0",
            }}
          >
            {demoSlug} &middot; free-tier backend
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700 }}>This demo may be asleep</h1>
          <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.5 }}>
            This demo runs on a real free-tier database, and free-tier databases pause themselves
            after a stretch of no traffic -- that&apos;s what just happened here, not a bug in this
            page. Waking a paused database back up usually takes a few seconds to about a minute.
          </p>
          <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.5 }}>
            Mercatus Liber is free, open-source infrastructure -- this demo staying up isn&apos;t
            guaranteed the same way a paid deployment would be. Try the button below in a moment;
            if it keeps failing after a few tries, the project may need to be manually recreated
            rather than just woken up.
          </p>
          <BackendAsleepRetryButton>Try again</BackendAsleepRetryButton>
          <p style={{ margin: "20px 0 0", fontSize: 13 }}>
            <a href="/" style={{ color: "#4338A0", textDecoration: "none" }}>
              &larr; Mercatus Liber home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
