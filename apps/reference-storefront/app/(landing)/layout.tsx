import type { ReactNode } from "react";

export const metadata = {
  title: "Mercatus Liber",
  description: "A free, MIT-licensed, headless commerce framework -- built to be AI-agent-accessible from the ground up.",
};

/**
 * demo-routing-05: the root layout for the FRAMEWORK LANDING PAGE
 * (design-discussion.md §3) -- deliberately minimal, no shop chrome (no
 * cart link, no theme switcher, no ClerkProvider) since none of that is
 * relevant outside a specific demo. That content now lives in
 * app/demo/[demoSlug]/layout.tsx instead.
 *
 * Lives under the `(landing)` route group (not literally `app/layout.tsx`)
 * so it can be a genuine, independent Next.js "root layout" -- see
 * node_modules/next/dist/docs/.../file-conventions/route-groups.md's
 * "Top-level root layout" caveat: multiple root layouts (this one and
 * app/demo/[demoSlug]/layout.tsx) require there be NO single top-level
 * app/layout.tsx shared by both, and the home route ("/") must live inside
 * one of the route groups instead. `(landing)` doesn't appear in the URL,
 * so this still serves exactly "/" -- but it's what makes
 * design-discussion.md §3's "navigating landing -> a demo is a full page
 * reload, Next's own 'multiple root layouts' pattern" claim actually true
 * (verified on a real dev server, not assumed) rather than a soft
 * client-side transition sharing one common ancestor layout.
 */
// The docs site's real, deployed public URL is an operational decision (DNS/domain binding,
// Vercel project creation) outside this app's scope -- see
// .pHive/epics/docs-site/docs/design-discussion.md §5. NEXT_PUBLIC_DOCS_URL lets a real
// deployment wire in the actual URL; unset, this falls back to a clearly-labeled placeholder
// so the link is never silently broken or silently wrong.
const DOCS_URL_PLACEHOLDER = "https://docs.example.com/PLACEHOLDER-set-NEXT_PUBLIC_DOCS_URL";

export default function LandingRootLayout({ children }: { children: ReactNode }) {
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? DOCS_URL_PLACEHOLDER;

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 720,
          margin: "0 auto",
          padding: 24,
          minHeight: "100vh",
        }}
      >
        <header style={{ marginBottom: 24, borderBottom: "1px solid #ccc", paddingBottom: 12 }}>
          <a href="/" style={{ fontWeight: 700, textDecoration: "none", color: "#111" }}>
            Mercatus Liber
          </a>
          {" · "}
          <a href={docsUrl} style={{ color: "#111" }}>
            Docs
          </a>
          {" · "}
          {/* vision-02: real, visible Vision & Roadmap link, reusing the exact same
              NEXT_PUBLIC_DOCS_URL-based docsUrl computed above for the Docs link --
              points at the docs site's real /vision route (apps/docs/content/vision.md,
              synced from repo-root VISION.md by sync-content.mjs). Same dual-state
              behavior as Docs: a real URL when NEXT_PUBLIC_DOCS_URL is set, the same
              clearly-labeled placeholder base (with /vision appended) when unset. */}
          <a href={`${docsUrl}/vision`} style={{ color: "#111" }}>
            Vision &amp; Roadmap
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}
