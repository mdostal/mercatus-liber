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
 * demo-routing-05: the framework landing page (design-discussion.md §3) --
 * replaces the old app/page.tsx, which rendered one demo's CMS "home" page
 * content (that content now lives at app/demo/[demoSlug]/page.tsx, the
 * demo's own home page). This is deliberately NOT a docs page and NOT a
 * shop page -- just what Mercatus Liber is, why it exists, and links out to
 * the two live demos. Every claim below is pulled from the root README.md
 * and docs/ARCHITECTURE.md, not invented -- see each section's comment for
 * where it comes from. This is a correct-structure-first pass (genuine but
 * unpolished content); the real visual/copy redesign is a separate, later
 * piece of work (epic 32).
 */
export default function LandingPage() {
  return (
    <main>
      <JsonLd data={organizationJsonLd} />
      {/* README.md line 1-4: name + tagline. */}
      <h1>Mercatus Liber</h1>
      <p>
        <em>&ldquo;Free market&rdquo; (Latin).</em> A legitimate, 100% free/open-source alternative to
        Shopify/Medusa/Saleor/etc. -- headless, AI-agent-accessible, and built to be stood up with a single
        tool.
      </p>

      {/* README.md line 6-11: the "what it is" paragraph. */}
      <h2>What it is</h2>
      <p>
        A free, MIT-licensed, headless commerce framework: a schema-first product/SKU catalog with pluggable
        database adapters, a marketing catalog genuinely separate from the sales catalog (the gap no existing
        free/OSS commerce platform actually fills), a per-page CMS instead of forced whole-site theming, a
        long-lived cart, adapter-based payments (Stripe first), analytics on by default (PostHog,
        config-swappable), and a plugin system for everything else (OMS, fulfillment, notifications).
      </p>

      {/* README.md line 13-16: the AI-and-human pitch. */}
      <p>
        Built as an <strong>AI and human commerce tool from the ground up</strong> -- every capability exposed
        to a human storefront/admin UI is equally exposed to AI agents via a documented skills/tool catalog and
        an MCP server, calling the exact same subsystem interfaces. No shadow API, no reduced agent-only
        surface.
      </p>

      {/* README.md "Why" section + ARCHITECTURE.md "Why this exists" section. */}
      <h2>Why it exists</h2>
      <p>
        Evaluated against every serious free/OSS commerce option (Medusa, Saleor, Vendure, Spree/Solidus,
        Shopware, Bagisto, Sylius) plus proprietary options (Snipcart, Swell). None fit: wrong stack, wrong
        deploy shape, unnecessary infrastructure for a small catalog, or not actually free. None of them --
        and no other free package found -- cleanly separates a <strong>sales catalog</strong> from a{" "}
        <strong>marketing catalog</strong> the way enterprise commerce platforms do. That separation, plus a
        schema-first, adapter-everywhere architecture, is the actual gap this project fills.
      </p>

      {/* README.md "Prime directive" section, condensed. */}
      <p>
        Every subsystem is a separate package talking through shared core types, adapter interfaces, or a
        typed event bus -- never another subsystem&rsquo;s internals. Swapping the payments adapter or the
        database adapter is meant to never touch catalog, cart, or CMS code.
      </p>

      {/* README.md "Status" line + License line. */}
      <p>
        <strong>Status:</strong> pre-alpha -- under active development. <strong>License:</strong> MIT. Give it
        away.
      </p>

      {/* Live demos, read from lib/demos.ts's registry so this list can never
          drift from the actual known demo slugs. */}
      <h2>Live demos</h2>
      <p>Two genuinely separate, simultaneously-live storefronts built on this framework:</p>
      <ul>
        {DEMO_SLUGS.map((slug) => (
          <li key={slug}>
            <a href={`/demo/${slug}`}>{DEMO_REGISTRY[slug].displayName}</a>
          </li>
        ))}
      </ul>

      {/*
        No GitHub/source repository URL is documented anywhere in the
        existing README.md or docs/ARCHITECTURE.md (grepped both for
        "github.com" -- zero matches; this repo isn't yet published under a
        public source URL), so per the brief's own "if it is documented"
        condition, no source-repo link is included here. Revisit once a real
        public repo URL exists.
      */}
    </main>
  );
}
