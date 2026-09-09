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
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
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
              <span className="ml-wordmark-mark" aria-hidden="true">
                ML
              </span>
              Mercatus&nbsp;Liber
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
                <span className="ml-wordmark-mark" aria-hidden="true">
                  ML
                </span>
                Mercatus&nbsp;Liber
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
    --ml-bg: #faf9f5;
    --ml-bg-alt: #ffffff;
    --ml-ink: #14161f;
    --ml-ink-soft: #545a6b;
    --ml-ink-faint: #8a8f9e;
    --ml-border: #e6e3d9;
    --ml-primary: #4338ca;
    --ml-primary-ink: #ffffff;
    --ml-primary-soft: #edeafd;
    --ml-accent: #ea580c;
    --ml-accent-soft: #fef1e7;
    --ml-radius-sm: 8px;
    --ml-radius: 14px;
    --ml-shadow: 0 1px 2px rgba(20,22,31,0.04), 0 10px 30px rgba(20,22,31,0.06);
    --ml-font-display: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --ml-font-body: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
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
  p { margin: 0 0 1em; color: var(--ml-ink-soft); }
  a { color: inherit; }
  code { font-family: var(--ml-font-mono); font-size: 0.9em; background: var(--ml-primary-soft); color: var(--ml-primary); padding: 0.1em 0.4em; border-radius: 5px; }

  /* Header */
  .ml-header { position: sticky; top: 0; z-index: 50; background: rgba(250,249,245,0.86); backdrop-filter: blur(10px); border-bottom: 1px solid var(--ml-border); }
  .ml-header-inner { display: flex; align-items: center; justify-content: space-between; padding: 16px 28px; gap: 24px; }
  .ml-wordmark { display: inline-flex; align-items: center; gap: 10px; font-family: var(--ml-font-display); font-weight: 700; font-size: 1.05rem; text-decoration: none; color: var(--ml-ink); }
  .ml-wordmark-mark { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; background: var(--ml-ink); color: #fff; font-size: 0.72rem; letter-spacing: 0.02em; }
  .ml-nav { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
  .ml-nav a { font-size: 0.92rem; font-weight: 500; text-decoration: none; color: var(--ml-ink-soft); transition: color 120ms ease; }
  .ml-nav a:hover { color: var(--ml-ink); }

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
  .ml-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ml-primary); background: var(--ml-primary-soft); border-radius: 999px; padding: 6px 14px; margin-bottom: 18px; }

  .ml-btn {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--ml-font-body); font-weight: 600; font-size: 0.92rem;
    padding: 11px 20px; border-radius: var(--ml-radius-sm); border: 1px solid transparent;
    text-decoration: none; cursor: pointer; transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }
  .ml-btn-primary { background: var(--ml-ink); color: #fff; }
  .ml-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(20,22,31,0.18); }
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
