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
 * demo-routing-05: the framework landing page (design-discussion.md §3) --
 * replaces the old app/page.tsx, which rendered one demo's CMS "home" page
 * content (that content now lives at app/demo/[demoSlug]/page.tsx, the
 * demo's own home page). This is deliberately NOT a docs page and NOT a
 * shop page -- just what Mercatus Liber is, why it exists, and links out to
 * the three live demos. Every claim below is pulled from the root README.md
 * and docs/ARCHITECTURE.md, not invented -- see each section's comment for
 * where it comes from. This is a correct-structure-first pass (genuine but
 * unpolished content); the real visual/copy redesign is a separate, later
 * piece of work (epic 32).
 *
 * seo-03: also renders faqJsonLd (design-discussion.md §2d(iii)) plus its
 * matching visible "Frequently asked questions" section below.
 */
export default function LandingPage() {
  return (
    <main>
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={faqJsonLd} />
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
      <p>Three genuinely separate, simultaneously-live storefronts built on this framework:</p>
      <ul>
        {DEMO_SLUGS.map((slug) => (
          <li key={slug}>
            <a href={`/demo/${slug}`}>{DEMO_REGISTRY[slug].displayName}</a>
          </li>
        ))}
      </ul>

      {/*
        seo-03: visible FAQ content matching faqJsonLd above exactly (Google's own structured-
        data guidelines expect FAQPage JSON-LD to reflect content actually visible on the page,
        not hidden markup) -- design-discussion.md §2d(iii)'s "genuinely common adoption
        questions", every answer sourced from the same real README.md/VISION.md content already
        cited elsewhere on this page.
      */}
      <h2>Frequently asked questions</h2>
      <h3>What is Mercatus Liber?</h3>
      <p>
        A free, MIT-licensed, headless commerce framework: a schema-first product/SKU catalog with pluggable
        database adapters, a marketing catalog genuinely separate from the sales catalog, a per-page CMS instead
        of forced whole-site theming, a long-lived cart, adapter-based payments (Stripe first), analytics on by
        default (PostHog, config-swappable), and a plugin system for everything else (OMS, fulfillment,
        notifications). It&rsquo;s built as an AI and human commerce tool from the ground up, with every
        capability exposed to a human storefront/admin UI equally exposed to AI agents via a documented
        skills/tool catalog and an MCP server.
      </p>
      <h3>Is Mercatus Liber free?</h3>
      <p>
        Yes. It&rsquo;s 100% free and open-source, MIT-licensed -- &ldquo;give it away.&rdquo; There&rsquo;s no
        per-transaction cut, no forced app-store tax, and no vendor lock-in. Status: pre-alpha, under active
        development.
      </p>
      <h3>Can I self-host it?</h3>
      <p>
        Yes -- that&rsquo;s the explicit goal. Mercatus Liber isn&rsquo;t a hosted SaaS platform; it&rsquo;s
        meant to be something a small business, an agency, or an individual developer can pick up, self-host or
        deploy anywhere, and own outright.
      </p>
      <h3>What payment, CMS, and admin-auth providers does it support?</h3>
      <p>
        Every subsystem that could plausibly have more than one implementation is adapter-based with a
        zero-infra reference default. Payments: Stripe, via <code>STRIPE_SECRET_KEY</code> (checkout still
        works without it in every other regard; only real charging requires it). CMS: Sanity, via{" "}
        <code>SANITY_PROJECT_ID</code>, falling back to a zero-infra in-memory CMS adapter when unset -- no
        external CMS required to run locally. Admin authentication: Clerk, via <code>CLERK_SECRET_KEY</code>,
        falling back to a local-development-only dev-password adapter when unset.
      </p>

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
