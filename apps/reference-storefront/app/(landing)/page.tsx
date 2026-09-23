import type { Metadata } from "next";
import { DEMO_REGISTRY, DEMO_SLUGS } from "../../lib/demos";
import { JsonLd } from "../../lib/json-ld";
import { canonicalUrl } from "../../lib/site-url";

/**
 * seo-01: real, specific metadata for the framework landing page (overriding
 * app/(landing)/layout.tsx's own generic fallback title/description, same
 * "page wins over layout" merge behavior generate-metadata.md documents) --
 * sourced from README.md's own real opening lines 1-16 (the exact same
 * lines this page's own JSX comments below already cite), not invented copy.
 */
export const metadata: Metadata = {
  title: "Mercatus Liber -- Free, Open-Source Headless Commerce",
  description:
    "Mercatus Liber is a free, MIT-licensed, headless commerce framework -- a legitimate open-source " +
    "alternative to Shopify, Medusa, and Saleor, with a marketing catalog genuinely separate from the sales " +
    "catalog, and built AI-agent-accessible from the ground up.",
  alternates: { canonical: canonicalUrl("/") },
};

/**
 * seo-02: real Organization + WebSite JSON-LD for the framework landing
 * page (design-discussion.md §2c) -- name/description/url reuse the exact
 * same real values as `metadata` above (itself sourced from README.md's own
 * opening lines, per seo-01), rather than re-deriving or inventing separate
 * copy. Combined under one `@graph` so both schema types ship in a single
 * `<script>` tag.
 */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Mercatus Liber",
      description: metadata.description,
      url: canonicalUrl("/"),
    },
    {
      "@type": "WebSite",
      name: "Mercatus Liber",
      description: metadata.description,
      url: canonicalUrl("/"),
    },
  ],
};

/**
 * seo-03: FAQPage JSON-LD (design-discussion.md §2d(iii)) -- the genuinely common questions a
 * prospective adopter or AI agent researching this framework would ask, per the story spec's own
 * list ("what is it, is it free, can I self-host it, does it support X payment/CMS/auth
 * provider"). Every answer is sourced from real content already in this repo, not invented --
 * see each entry's comment for the exact source. Rendered as its own `<script>` tag (a second
 * JsonLd call, same pattern as PDP's Product + BreadcrumbList JSON-LD in
 * app/demo/[demoSlug]/products/[slug]/page.tsx) rather than folded into organizationJsonLd's
 * @graph, since FAQPage is conceptually a distinct page feature (the FAQ content actually
 * rendered below), not another facet of the Organization/WebSite entities.
 */
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      // README.md lines 1-11 ("A free, MIT-licensed, headless commerce framework...").
      name: "What is Mercatus Liber?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "A free, MIT-licensed, headless commerce framework: a schema-first product/SKU catalog " +
          "with pluggable database adapters, a marketing catalog genuinely separate from the sales " +
          "catalog, a per-page CMS instead of forced whole-site theming, a long-lived cart, " +
          "adapter-based payments (Stripe first), analytics on by default (PostHog, " +
          "config-swappable), and a plugin system for everything else (OMS, fulfillment, " +
          "notifications). It's built as an AI and human commerce tool from the ground up, with " +
          "every capability exposed to a human storefront/admin UI equally exposed to AI agents " +
          "via a documented skills/tool catalog and an MCP server.",
      },
    },
    {
      "@type": "Question",
      // README.md "Status"/"License" lines + VISION.md opening paragraph.
      name: "Is Mercatus Liber free?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "Yes. It's 100% free and open-source, MIT-licensed -- \"give it away.\" There's no " +
          "per-transaction cut, no forced app-store tax, and no vendor lock-in. Status: pre-alpha, " +
          "under active development.",
      },
    },
    {
      "@type": "Question",
      // VISION.md opening paragraph ("self-host or deploy anywhere, and own outright").
      name: "Can I self-host it?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "Yes -- that's the explicit goal. Mercatus Liber isn't a hosted SaaS platform; it's " +
          "meant to be something a small business, an agency, or an individual developer can pick " +
          "up, self-host or deploy anywhere, and own outright.",
      },
    },
    {
      "@type": "Question",
      // README.md "Configuration" section: Payments/Content(CMS)/Admin-authentication subsections.
      name: "What payment, CMS, and admin-auth providers does it support?",
      acceptedAnswer: {
        "@type": "Answer",
        text:
          "Every subsystem that could plausibly have more than one implementation is adapter-based " +
          "with a zero-infra reference default. Payments: Stripe, via STRIPE_SECRET_KEY (checkout " +
          "still works without it in every other regard; only real charging requires it). CMS: " +
          "Sanity, via SANITY_PROJECT_ID, falling back to a zero-infra in-memory CMS adapter when " +
          "unset -- no external CMS required to run locally. Admin authentication: Clerk, via " +
          "CLERK_SECRET_KEY, falling back to a local-development-only dev-password adapter when " +
          "unset.",
      },
    },
  ],
};

/**
 * landing-visual-glow-up: real visual redesign of the framework's own
 * demo-agnostic marketing page -- keeps every real content claim from the
 * previous plain-HTML pass (demo-routing-05) byte-for-byte (still sourced
 * from README.md/ARCHITECTURE.md/VISION.md, see each block's inline
 * comment), just gives it a genuine visual identity: a dark hero panel, a
 * card-based "what it is / why it exists" section, data-driven demo cards
 * (title + description straight from lib/demos.ts's DEMO_REGISTRY, not
 * invented blurbs), a themes teaser linking to the new /themes gallery
 * (epic: landing-visual-glow-up, theme-gallery story), and the same real
 * FAQ content rendered as a native <details> accordion so it stays
 * genuinely readable without JS. Page-specific CSS only -- the shared
 * header/footer/card/button primitives live in app/(landing)/layout.tsx's
 * LANDING_CSS, per that file's own doc comment.
 */
export default function LandingPage() {
  return (
    <>
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={faqJsonLd} />
      <style>{PAGE_CSS}</style>

      {/* Hero: README.md line 1-4 (name + tagline). */}
      <section className="mlp-hero">
        <div className="ml-shell mlp-hero-inner">
          <span className="ml-eyebrow mlp-eyebrow-dark">Free &middot; MIT-licensed &middot; Pre-alpha</span>
          <h1 className="mlp-hero-title">Mercatus Liber</h1>
          <p className="mlp-hero-tagline">
            <em>&ldquo;Free market&rdquo; (Latin).</em> A legitimate, 100% free/open-source alternative to
            Shopify, Medusa, and Saleor &mdash; headless, AI-agent-accessible, and built to be stood up with a
            single tool.
          </p>
          <div className="mlp-hero-actions">
            <a className="ml-btn ml-btn-primary mlp-btn-light" href="#mlp-demos">
              Browse live demos
            </a>
            <a className="ml-btn ml-btn-ghost mlp-btn-outline-light" href="/themes">
              Explore the 10 themes &rarr;
            </a>
          </div>
        </div>
      </section>

      <div className="ml-shell">
        {/* README.md line 6-16: "what it is" + the AI-and-human pitch. */}
        <section className="ml-section mlp-what">
          <div className="ml-section-head">
            <span className="ml-eyebrow">What it is</span>
            <h2>A schema-first commerce framework, not another storefront template</h2>
          </div>
          <div className="ml-grid ml-grid-2">
            <div className="ml-card">
              <p>
                A free, MIT-licensed, headless commerce framework: a schema-first product/SKU catalog with
                pluggable database adapters, a marketing catalog genuinely separate from the sales catalog (the
                gap no existing free/OSS commerce platform actually fills), a per-page CMS instead of forced
                whole-site theming, a long-lived cart, adapter-based payments (Stripe first), analytics on by
                default (PostHog, config-swappable), and a plugin system for everything else (OMS, fulfillment,
                notifications).
              </p>
            </div>
            <div className="ml-card">
              <p>
                Built as an <strong>AI and human commerce tool from the ground up</strong> &mdash; every
                capability exposed to a human storefront/admin UI is equally exposed to AI agents via a
                documented skills/tool catalog and an MCP server, calling the exact same subsystem interfaces.
                No shadow API, no reduced agent-only surface.
              </p>
            </div>
          </div>
        </section>

        {/* README.md "Why" section + ARCHITECTURE.md "Why this exists" section, plus the prime-directive paragraph. */}
        <section className="ml-section mlp-why">
          <div className="ml-section-head">
            <span className="ml-eyebrow">Why it exists</span>
            <h2>None of the free/OSS options actually separate marketing from sales</h2>
          </div>
          <div className="ml-card mlp-why-card">
            <p>
              Evaluated against every serious free/OSS commerce option (Medusa, Saleor, Vendure, Spree/Solidus,
              Shopware, Bagisto, Sylius) plus proprietary options (Snipcart, Swell). None fit: wrong stack, wrong
              deploy shape, unnecessary infrastructure for a small catalog, or not actually free. None of them
              &mdash; and no other free package found &mdash; cleanly separates a <strong>sales catalog</strong>{" "}
              from a <strong>marketing catalog</strong> the way enterprise commerce platforms do. That
              separation, plus a schema-first, adapter-everywhere architecture, is the actual gap this project
              fills.
            </p>
            <p>
              Every subsystem is a separate package talking through shared core types, adapter interfaces, or a
              typed event bus &mdash; never another subsystem&rsquo;s internals. Swapping the payments adapter or
              the database adapter is meant to never touch catalog, cart, or CMS code.{" "}
              <a href="/architecture">See how the adapter pattern actually works &rarr;</a>
            </p>
          </div>
          <p className="mlp-status-line">
            <strong>Status:</strong> pre-alpha &mdash; under active development. <strong>License:</strong> MIT.
            Give it away.
          </p>
        </section>

        {/* Live demos, read from lib/demos.ts's registry so this list can never
            drift from the actual known demo slugs -- displayName/description are
            both real fields already on DemoDefinition, not invented copy. */}
        <section className="ml-section mlp-demos" id="mlp-demos">
          <div className="ml-section-head">
            <span className="ml-eyebrow">Live demos</span>
            <h2>Three genuinely separate storefronts, one framework</h2>
            <p>Simultaneously live, each on its own theme, catalog, and CMS content.</p>
          </div>
          <div className="ml-grid ml-grid-3">
            {DEMO_SLUGS.map((slug) => {
              const demo = DEMO_REGISTRY[slug];
              return (
                <a key={slug} href={`/demo/${slug}`} className="ml-card mlp-demo-card">
                  <span className="mlp-demo-name">{demo.displayName}</span>
                  <p className="mlp-demo-desc">{demo.description}</p>
                  <span className="mlp-demo-cta">Visit store &rarr;</span>
                </a>
              );
            })}
          </div>
        </section>

        {/* Theme gallery teaser -- the real gallery lives at /themes (epic:
            landing-visual-glow-up, theme-gallery story) so it can show all 10
            bundles with a real color swatch + cross-apply control per bundle
            without overloading this page. */}
        <section className="ml-section mlp-themes-teaser">
          <div className="ml-card mlp-themes-card">
            <div>
              <span className="ml-eyebrow">10 real theme bundles</span>
              <h2>One component-level theming system, ten complete visual identities</h2>
              <p>
                Every theme is a real set of design tokens and page templates &mdash; from a warm editorial
                artisan-market look to a bold maximalist grid to a precision technical datasheet layout. Preview
                any theme, then cross-apply it straight onto any of the three live demo stores.
              </p>
            </div>
            <a className="ml-btn ml-btn-primary" href="/themes">
              Open the theme gallery &rarr;
            </a>
          </div>
        </section>

        {/*
          seo-03: visible FAQ content matching faqJsonLd above exactly (Google's own structured-
          data guidelines expect FAQPage JSON-LD to reflect content actually visible on the page,
          not hidden markup) -- design-discussion.md §2d(iii)'s "genuinely common adoption
          questions", every answer sourced from the same real README.md/VISION.md content already
          cited elsewhere on this page. Rendered as native <details>/<summary> so it's a real,
          readable accordion with zero JS.
        */}
        <section className="ml-section mlp-faq">
          <div className="ml-section-head">
            <span className="ml-eyebrow">FAQ</span>
            <h2>Frequently asked questions</h2>
          </div>
          <div className="mlp-faq-list">
            <details className="mlp-faq-item" open>
              <summary>What is Mercatus Liber?</summary>
              <p>
                A free, MIT-licensed, headless commerce framework: a schema-first product/SKU catalog with
                pluggable database adapters, a marketing catalog genuinely separate from the sales catalog, a
                per-page CMS instead of forced whole-site theming, a long-lived cart, adapter-based payments
                (Stripe first), analytics on by default (PostHog, config-swappable), and a plugin system for
                everything else (OMS, fulfillment, notifications). It&rsquo;s built as an AI and human commerce
                tool from the ground up, with every capability exposed to a human storefront/admin UI equally
                exposed to AI agents via a documented skills/tool catalog and an MCP server.
              </p>
            </details>
            <details className="mlp-faq-item">
              <summary>Is Mercatus Liber free?</summary>
              <p>
                Yes. It&rsquo;s 100% free and open-source, MIT-licensed &mdash; &ldquo;give it away.&rdquo;
                There&rsquo;s no per-transaction cut, no forced app-store tax, and no vendor lock-in. Status:
                pre-alpha, under active development.
              </p>
            </details>
            <details className="mlp-faq-item">
              <summary>Can I self-host it?</summary>
              <p>
                Yes &mdash; that&rsquo;s the explicit goal. Mercatus Liber isn&rsquo;t a hosted SaaS platform;
                it&rsquo;s meant to be something a small business, an agency, or an individual developer can pick
                up, self-host or deploy anywhere, and own outright.
              </p>
            </details>
            <details className="mlp-faq-item">
              <summary>What payment, CMS, and admin-auth providers does it support?</summary>
              <p>
                Every subsystem that could plausibly have more than one implementation is adapter-based with a
                zero-infra reference default. Payments: Stripe, via <code>STRIPE_SECRET_KEY</code> (checkout
                still works without it in every other regard; only real charging requires it). CMS: Sanity, via{" "}
                <code>SANITY_PROJECT_ID</code>, falling back to a zero-infra in-memory CMS adapter when unset
                &mdash; no external CMS required to run locally. Admin authentication: Clerk, via{" "}
                <code>CLERK_SECRET_KEY</code>, falling back to a local-development-only dev-password adapter when
                unset. See the <a href="/architecture">architecture &amp; adapters page</a> for this
                deployment&rsquo;s actual, live wiring.
              </p>
            </details>
          </div>
        </section>

        {/*
          No GitHub/source repository URL is documented anywhere in the
          existing README.md or docs/ARCHITECTURE.md (grepped both for
          "github.com" -- zero matches; this repo isn't yet published under a
          public source URL), so per the brief's own "if it is documented"
          condition, no source-repo link is included here. Revisit once a real
          public repo URL exists.
        */}
      </div>
    </>
  );
}

const PAGE_CSS = `
  /* bs-02-landing-page-brand: the one dark hero panel now grounds its background
     in Carbon Ink (--ml-ink, #1A1A1D) with a Ledger Indigo (--ml-primary) glow as
     the system's single confident accent, rather than the previous bespoke
     navy/purple -- same "one dark section on an otherwise light, Paper-Neutral
     page" shape as before, just built from the real brand tokens now. */
  .mlp-hero {
    background: radial-gradient(1200px 480px at 15% -10%, rgba(67,56,160,0.4) 0%, transparent 60%), linear-gradient(160deg, #1a1a1d 0%, #202126 100%);
    color: #f3f3f1;
    padding: 88px 0 76px;
  }
  .mlp-hero-inner { max-width: 760px; }
  .mlp-eyebrow-dark { background: rgba(243,243,241,0.1); color: #cac5ef; }
  .mlp-hero-title {
    font-size: clamp(2.6rem, 6vw, 4rem);
    letter-spacing: -0.02em;
    color: #ffffff;
    margin-bottom: 0.35em;
  }
  .mlp-hero-tagline { font-size: 1.15rem; color: #c9c8c5; max-width: 58ch; margin-bottom: 2em; }
  .mlp-hero-tagline em { color: #fff; font-style: normal; font-weight: 600; }
  .mlp-hero-actions { display: flex; gap: 14px; flex-wrap: wrap; }
  .mlp-btn-light { background: #fff; color: #1a1a1d; }
  .mlp-btn-light:hover { box-shadow: 0 10px 24px rgba(0,0,0,0.35); }
  .mlp-btn-outline-light { border-color: rgba(255,255,255,0.28); color: #fff; }
  .mlp-btn-outline-light:hover { border-color: #fff; }

  .mlp-why-card p:last-child { margin-bottom: 0; }
  .mlp-why-card a { color: var(--ml-primary); font-weight: 600; text-decoration: none; }
  .mlp-why-card a:hover { text-decoration: underline; }
  .mlp-status-line { margin-top: 20px; font-size: 0.92rem; color: var(--ml-ink-soft); }
  .mlp-status-line strong { color: var(--ml-ink); }

  .mlp-demo-card { text-decoration: none; display: flex; flex-direction: column; gap: 10px; transition: transform 140ms ease, box-shadow 140ms ease; }
  .mlp-demo-card:hover { transform: translateY(-3px); box-shadow: 0 16px 34px rgba(26,26,29,0.12); }
  .mlp-demo-name { font-family: var(--ml-font-display); font-weight: 600; font-size: 1.15rem; }
  .mlp-demo-desc { font-size: 0.92rem; margin: 0; flex: 1; }
  .mlp-demo-cta { font-size: 0.86rem; font-weight: 600; color: var(--ml-primary); }

  .mlp-themes-card {
    display: flex; align-items: center; justify-content: space-between; gap: 32px;
    background: linear-gradient(120deg, var(--ml-primary-soft), var(--ml-accent-soft));
    border-color: transparent;
  }
  .mlp-themes-card h2 { margin-top: 4px; }
  .mlp-themes-card p { margin-bottom: 0; max-width: 56ch; }
  .mlp-themes-card > a { flex-shrink: 0; }

  .mlp-faq-list { display: flex; flex-direction: column; gap: 12px; }
  .mlp-faq-item { background: var(--ml-bg-alt); border: 1px solid var(--ml-border); border-radius: var(--ml-radius-sm); padding: 6px 20px; }
  .mlp-faq-item summary { cursor: pointer; padding: 14px 0; font-family: var(--ml-font-display); font-weight: 600; font-size: 1.02rem; list-style: none; }
  .mlp-faq-item summary::-webkit-details-marker { display: none; }
  .mlp-faq-item summary::after { content: "+"; float: right; color: var(--ml-ink-faint); font-weight: 400; }
  .mlp-faq-item[open] summary::after { content: "−"; }
  .mlp-faq-item p { padding-bottom: 16px; margin-bottom: 0; }

  @media (max-width: 620px) {
    .mlp-hero { padding: 64px 0 48px; }
    .mlp-themes-card { flex-direction: column; align-items: flex-start; }
  }
`;
