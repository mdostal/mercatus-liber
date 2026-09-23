import type { ReactNode } from "react";
import { DEMO_REGISTRY, DEMO_SLUGS } from "../../lib/demos";

export const metadata = {
  title: "Mercatus Liber",
  description: "A free, MIT-licensed, headless commerce framework -- built to be AI-agent-accessible from the ground up.",
};

/**
 * demo-routing-05: the root layout for the FRAMEWORK LANDING PAGE
 * (design-discussion.md §3) -- deliberately minimal shop chrome (no cart
 * link, no theme switcher, no ClerkProvider) since none of that is
 * relevant outside a specific demo. That content lives in
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
 *
 * bs-02-landing-page-brand: LANDING_CSS's :root tokens below now carry the
 * FRAMEWORK's real brand system (.pHive/brand/brand-system.yaml, produced by
 * bs-01-brand-system-tokens) -- Ledger Indigo #4338A0 primary, Garnet
 * #A13A3A secondary/alert (kept under the existing --ml-accent var names to
 * minimize touched files -- see that var's value, not its name), Carbon Ink
 * #1A1A1D neutral, Paper Neutral #F3F3F1 surface, Public Sans (heading+body)
 * + JetBrains Mono (accent/code/nav chrome) type system, a 4px spacing
 * scale, and tight 4px/8px radii. The header/footer wordmark now uses the
 * brand guide's "Compact / nav & footer chrome" lockup verbatim (all-
 * lowercase, set in JetBrains Mono, ink-colored) -- brand-guide.html's own
 * Logo Concepts section names this treatment explicitly for "nav bar,
 * footer" contexts. This is the framework's OWN identity, distinct from any
 * of the 10 demo-store theme bundles in packages/theming (untouched by this
 * story) and from app/demo/[demoSlug]/** (also untouched).
 *
 * landing-visual-glow-up: this is now also where the real visual design
 * system for the demo-agnostic marketing surface lives -- a shared
 * `<style>{LANDING_CSS}</style>` block (same "hand-written CSS constant in
 * a Server Component" convention as components/pdp-tabbed-detail.tsx's
 * MX_PDP_CSS or app/demo/[demoSlug]/checkout/sandbox/page.tsx's
 * SANDBOX_CSS) covering the header/footer chrome plus every reusable
 * primitive (`.ml-shell`, `.ml-card`, `.ml-btn`, `.ml-eyebrow`, etc.) that
 * app/(landing)/page.tsx, app/(landing)/themes/page.tsx and
 * app/(landing)/architecture/page.tsx all build on -- rendered once here
 * (this layout's `<head>`) rather than duplicated per page, since every
 * page under this route group shares the exact same design language. Each
 * page's own file still carries whatever CSS is genuinely specific to it
 * (the theme-swatch grid, the adapter table, etc.), matching the rest of
 * this app's "CSS lives next to the markup it styles" convention.
 */
const DOCS_URL_PLACEHOLDER = "https://docs.example.com/PLACEHOLDER-set-NEXT_PUBLIC_DOCS_URL";

export default function LandingRootLayout({ children }: { children: ReactNode }) {
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? DOCS_URL_PLACEHOLDER;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        <style>{LANDING_CSS}</style>
      </head>
      <body className="ml-body">
        <a className="ml-skip-link" href="#ml-main">
          Skip to content
        </a>
        <header className="ml-header">
          <div className="ml-shell ml-header-inner">
            <a href="/" className="ml-wordmark">
              mercatus liber
            </a>
            <nav className="ml-nav" aria-label="Primary">
              <a href="/themes">Themes</a>
              <a href="/architecture">Architecture</a>
              <a href={docsUrl}>Docs</a>
              <a href={`${docsUrl}/vision`}>Vision &amp; Roadmap</a>
            </nav>
          </div>
        </header>

        <main id="ml-main">{children}</main>

        <footer className="ml-footer">
          <div className="ml-shell ml-footer-inner">
            <div className="ml-footer-brand">
              <a href="/" className="ml-wordmark ml-wordmark-footer">
                mercatus liber
              </a>
              <p>Free, MIT-licensed, headless commerce. Give it away.</p>
            </div>

            <div className="ml-footer-col">
              <h3>Framework</h3>
              <a href="/themes">Theme gallery</a>
              <a href="/architecture">Architecture &amp; adapters</a>
              <a href={docsUrl}>Documentation</a>
              <a href={`${docsUrl}/vision`}>Vision &amp; roadmap</a>
            </div>

            <div className="ml-footer-col">
              <h3>Live demos</h3>
              {DEMO_SLUGS.map((slug) => (
                <a key={slug} href={`/demo/${slug}`}>
                  {DEMO_REGISTRY[slug].displayName}
                </a>
              ))}
            </div>
          </div>
          <div className="ml-shell ml-footer-legal">
            <span>MIT licensed. Pre-alpha, under active development.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

const LANDING_CSS = `
  :root {
    /* Paper Neutral (surface) -- .pHive/brand/brand-system.yaml colors.surface */
    --ml-bg: #f3f3f1;
    --ml-bg-alt: #ffffff;
    /* Carbon Ink (neutral) -- colors.neutral, plus derived true-neutral (non-warm,
       non-cool) soft/faint steps for secondary text and hairlines. */
    --ml-ink: #1a1a1d;
    --ml-ink-soft: #5a5a5e;
    --ml-ink-faint: #8c8c90;
    --ml-border: #dedcd9;
    /* Ledger Indigo (primary) -- colors.primary: the system's one confident
       accent (primary CTAs, links, focus states, active nav state). */
    --ml-primary: #4338a0;
    --ml-primary-ink: #ffffff;
    --ml-primary-soft: #eae8f5;
    /* Garnet (secondary) -- colors.secondary: alerts, destructive actions, rare
       emphasis. Kept under the pre-existing --ml-accent var names so every page
       under app/(landing)/** that already references them (themes, architecture)
       picks up the real brand color with no further edits needed. */
    --ml-accent: #a13a3a;
    --ml-accent-soft: #f4e8e7;
    /* radius: tight, per brand-system.yaml's radius.medium/large (small=2/full=9999
       exist in the token set but aren't needed by any chrome on this page). */
    --ml-radius-sm: 4px;
    --ml-radius: 8px;
    --ml-shadow: 0 1px 2px rgba(26,26,29,0.05), 0 10px 24px rgba(26,26,29,0.07);
    /* typography.heading_font / body_font: Public Sans (both -- one plain,
       highly legible face for every reading and heading context, per the
       brand system's own restraint rationale). typography.accent_font:
       JetBrains Mono, for nav labels/badges/pills/inline code only. */
    --ml-font-display: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
    --ml-font-body: 'Public Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --ml-font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
    --ml-max: 1120px;
  }

  * { box-sizing: border-box; }

  .ml-skip-link {
    position: absolute; left: -9999px; top: 0; z-index: 100;
    background: var(--ml-ink); color: #fff; padding: 10px 16px; border-radius: 0 0 8px 0;
  }
  .ml-skip-link:focus { left: 0; }

  .ml-body {
    margin: 0;
    background: var(--ml-bg);
    color: var(--ml-ink);
    font-family: var(--ml-font-body);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  .ml-shell { max-width: var(--ml-max); margin: 0 auto; padding: 0 28px; }

  h1, h2, h3, h4 { font-family: var(--ml-font-display); font-weight: 600; line-height: 1.15; margin: 0 0 0.5em; color: var(--ml-ink); }
  h1 { font-weight: 700; } /* weights.700 "Bold": page headings, hero copy, primary CTAs */
  p { margin: 0 0 1em; color: var(--ml-ink-soft); }
  a { color: inherit; }
  code { font-family: var(--ml-font-mono); font-size: 0.9em; background: var(--ml-primary-soft); color: var(--ml-primary); padding: 0.1em 0.4em; border-radius: 5px; }

  /* Header */
  .ml-header { position: sticky; top: 0; z-index: 50; background: rgba(243,243,241,0.86); backdrop-filter: blur(10px); border-bottom: 1px solid var(--ml-border); }
  .ml-header-inner { display: flex; align-items: center; justify-content: space-between; padding: 16px 28px; gap: 24px; }
  /* brand-guide.html "Compact / nav & footer chrome" lockup: all-lowercase,
     set entirely in the mono accent face, single ink color -- the treatment
     the guide itself names for exactly this context. */
  .ml-wordmark { display: inline-flex; align-items: center; font-family: var(--ml-font-mono); font-weight: 500; font-size: 1.05rem; letter-spacing: -0.01em; text-decoration: none; color: var(--ml-ink); }
  .ml-nav { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
  .ml-nav a { font-size: 0.92rem; font-weight: 500; text-decoration: none; color: var(--ml-ink-soft); transition: color 120ms ease; }
  .ml-nav a:hover { color: var(--ml-primary); }

  /* Footer */
  .ml-footer { margin-top: 96px; border-top: 1px solid var(--ml-border); background: var(--ml-bg-alt); }
  .ml-footer-inner { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 40px; padding: 56px 28px 32px; }
  .ml-footer-brand p { max-width: 30ch; margin-top: 10px; font-size: 0.9rem; }
  .ml-wordmark-footer { margin-bottom: 4px; }
  .ml-footer-col h3 { font-family: var(--ml-font-body); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ml-ink-faint); margin-bottom: 14px; }
  .ml-footer-col { display: flex; flex-direction: column; gap: 10px; }
  .ml-footer-col a { font-size: 0.92rem; text-decoration: none; color: var(--ml-ink-soft); }
  .ml-footer-col a:hover { color: var(--ml-primary); }
  .ml-footer-legal { padding: 20px 28px 32px; border-top: 1px solid var(--ml-border); font-size: 0.82rem; color: var(--ml-ink-faint); }

  /* Shared primitives every landing-group page draws on */
  /* accent_font_usage: nav labels, badges/pills -- the eyebrow pill is exactly
     that, so it's set in the mono accent face rather than Public Sans. */
  .ml-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: var(--ml-font-mono); font-size: 0.74rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--ml-primary); background: var(--ml-primary-soft); border-radius: 999px; padding: 6px 14px; margin-bottom: 18px; }

  .ml-btn {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--ml-font-body); font-weight: 600; font-size: 0.92rem;
    padding: 11px 20px; border-radius: var(--ml-radius-sm); border: 1px solid transparent;
    text-decoration: none; cursor: pointer; transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }
  /* colors.primary usage: "primary CTAs, links, focus states, active nav state" --
     the primary button is the textbook case, so it carries Ledger Indigo directly
     rather than plain ink. */
  .ml-btn-primary { background: var(--ml-primary); color: var(--ml-primary-ink); }
  .ml-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(67,56,160,0.28); }
  .ml-btn-ghost { background: transparent; color: var(--ml-ink); border-color: var(--ml-border); }
  .ml-btn-ghost:hover { border-color: var(--ml-ink); }
  .ml-btn-sm { padding: 8px 14px; font-size: 0.82rem; }
  .ml-btn-block { width: 100%; justify-content: center; }

  .ml-card {
    background: var(--ml-bg-alt); border: 1px solid var(--ml-border); border-radius: var(--ml-radius);
    padding: 28px; box-shadow: var(--ml-shadow);
  }

  .ml-section { padding: 72px 0; }
  .ml-section-head { max-width: 640px; margin-bottom: 44px; }
  .ml-section-head h2 { font-size: clamp(1.6rem, 2.4vw, 2.1rem); }
  .ml-section-head p { font-size: 1.05rem; }

  .ml-grid { display: grid; gap: 24px; }
  .ml-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .ml-grid-2 { grid-template-columns: repeat(2, 1fr); }

  @media (max-width: 860px) {
    .ml-footer-inner { grid-template-columns: 1fr 1fr; }
    .ml-grid-3 { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 620px) {
    .ml-nav { gap: 16px; }
    .ml-footer-inner { grid-template-columns: 1fr; }
    .ml-grid-3, .ml-grid-2 { grid-template-columns: 1fr; }
    .ml-section { padding: 48px 0; }
  }
`;
