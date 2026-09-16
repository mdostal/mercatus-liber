import type { Metadata } from "next";
import { getAdapterInfo } from "../../../lib/adapter-info";
import { canonicalUrl } from "../../../lib/site-url";
import { DEMO_REGISTRY, DEMO_SLUGS } from "../../../lib/demos";

export const metadata: Metadata = {
  title: "Architecture & Adapters",
  description:
    "How Mercatus Liber's adapter pattern actually works: a small typed interface per swappable " +
    "subsystem, one concrete implementation wired at startup, and this deployment's real, live adapter " +
    "wiring right now.",
  alternates: { canonical: canonicalUrl("/architecture") },
};

/**
 * landing-visual-glow-up (architecture story): "tell us the story of what
 * the integration and architecture decisions are and how we make adapters so
 * you can use and choose any of the frameworks without changing the core."
 *
 * Three parts, all grounded in real code rather than marketing claims:
 *
 * 1. A live table from lib/adapter-info.ts's getAdapterInfo() -- computed
 *    fresh from process.env on every request, mirroring lib/services.ts's own
 *    env-reading branches exactly (see that module's own doc comment). This
 *    is genuinely what THIS running deployment chose, not a static claim.
 * 2. A per-demo persistence breakdown (per-demo-backend-diversity and
 *    full-commerce-persistence-audit epics) -- unlike every other row above,
 *    catalog persistence and the 14 subsystems built on top of it are
 *    demo-aware, not process-wide: print-shop, northline, and broadleaf can
 *    each genuinely resolve to a different real database. This table proves
 *    it live, one row per subsystem, one column per real demo slug.
 * 3. A concrete walkthrough of the payments adapter as the flagship example
 *    of the swap pattern (packages/payments/src/types.ts's PaymentAdapter
 *    interface, packages/payments/src/stripe-adapter.ts, and the sandbox
 *    adapter's own doc comment in packages/payments/src/sandbox-adapter.ts)
 *    -- a real second, fully-working implementation that swaps in with zero
 *    changes to checkout-orders, cart, or catalog code.
 *
 * Honesty constraint, UPDATED from the original story brief: that brief said
 * all 3 demo stores share the same adapter wiring process-wide, with no
 * per-store divergence -- true for every OTHER subsystem below (CMS,
 * payments, analytics, fulfillment, shipping, media), but no longer true for
 * persistence/inventory specifically, which genuinely differ per demo now.
 * This page states that distinction explicitly rather than papering over it.
 */
// Real bug, found live in production: this page's whole premise is "this
// deployment's real, live adapter wiring right now" (see doc comment above
// and this page's own metadata description), but with no dynamic API call
// Next.js has no signal that it needs per-request rendering -- it silently
// prerenders once at BUILD time instead, baking in whatever process.env
// looked like during that build. Confirmed live: a `vercel --prod --force`
// redeploy (bypassing every build cache) still showed stale adapter status
// after DATABASE_URL/POSTHOG_API_KEY were added purely as env-var changes
// with no source-file diff to force a genuine rebuild-with-new-env. Dynamic
// routes (lib/services.ts's buildServices) were never affected -- they
// already read process.env fresh per-request by construction.
export const dynamic = "force-dynamic";

// full-commerce-persistence-audit epic: every subsystem lib/adapter-info.ts's
// getAdapterInfo() now resolves per-demo (Persistence/Inventory from the
// original per-demo-backend-diversity epic, plus the 13 newly-Postgres-wired
// subsystems below) -- exactly the same subsystem name strings that module's
// own catalogEntityInfo/cartInfo/etc. functions return, kept in one ordered
// list here so this page's per-demo table (section 2) can render one row per
// subsystem with each store as a column, rather than the reverse (a row per
// store would mean 15 columns, unreadable at any width).
const PER_DEMO_SUBSYSTEMS = [
  "Persistence (catalog)",
  "Inventory",
  "Catalog (named entity)",
  "Cart",
  "Orders (checkout)",
  "Customer profiles (account)",
  "Promotions",
  "Reviews",
  "Storefront views",
  "Bundles",
  "Recommendations",
  "Advertising (campaigns)",
  "Service areas",
  "Internal BI event log",
  "Fulfillment routing",
] as const;

export default function ArchitecturePage() {
  // Per-demo subsystems rendered separately below (section 2) -- every other
  // row here is genuinely process-wide/shared, so a single no-arg call
  // (falling back to the first registered demo internally, per
  // getAdapterInfo's own doc comment) is correct for THIS table.
  const perDemoSubsystemNames: readonly string[] = PER_DEMO_SUBSYSTEMS;
  const sharedAdapters = getAdapterInfo().filter((row) => !perDemoSubsystemNames.includes(row.subsystem));
  // One row per subsystem, one column per store -- transposed from a naive
  // "one row per store" shape, which would need 15 columns (Persistence/
  // Inventory plus the 13 subsystems the full-commerce-persistence-audit
  // epic newly wired onto real Postgres) to be unreadable at any width.
  const perDemoInfoBySlug = new Map(DEMO_SLUGS.map((slug) => [slug, getAdapterInfo(slug)]));
  const perDemoSubsystemRows = PER_DEMO_SUBSYSTEMS.map((subsystem) => ({
    subsystem,
    bySlug: DEMO_SLUGS.map((slug) => ({
      slug,
      info: perDemoInfoBySlug.get(slug)!.find((row) => row.subsystem === subsystem)!,
    })),
  }));

  return (
    <div className="ml-shell mla-page">
      <style>{ARCHITECTURE_CSS}</style>

      <section className="mla-intro">
        <span className="ml-eyebrow">Architecture</span>
        <h1>Adapters: choose any provider without changing the core</h1>
        <p>
          Every subsystem that could plausibly have more than one real-world implementation &mdash; where
          data lives, what powers the CMS, who processes a payment, how analytics events are collected, who
          fulfills an order, who ships a package &mdash; is defined as a small, typed interface in its own
          package. The rest of the app (catalog, cart, checkout, admin UI, the AI tool catalog) talks only to
          that interface. A merchant picks concrete implementations once, at startup, via environment
          variables; swapping one out is meant to never require touching catalog, cart, or CMS code.
        </p>
      </section>

      <section className="mla-section">
        <h2>This deployment&rsquo;s live adapter wiring</h2>
        <p className="mla-lede">
          Computed fresh from this process&rsquo;s own environment variables on every request (
          <code>lib/adapter-info.ts</code>&rsquo;s <code>getAdapterInfo()</code>) &mdash; not a static claim.
          <strong> All three demo stores on this deployment (print-shop, northline, broadleaf) share this
          exact wiring</strong>, since it&rsquo;s process-wide, not per-store: a real merchant configures these
          env vars once for their own deployment. (Persistence and the 14 subsystems built on top of it are
          the exceptions &mdash; see the per-demo table right below.)
        </p>
        <div className="mla-table-wrap">
          <table className="mla-table">
            <thead>
              <tr>
                <th>Subsystem</th>
                <th>Active adapter</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {sharedAdapters.map((row) => (
                <tr key={row.subsystem}>
                  <td className="mla-subsystem">{row.subsystem}</td>
                  <td>
                    <span className="mla-badge">{row.adapter}</span>
                  </td>
                  <td className="mla-detail">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mla-section">
        <h2>Persistence, per demo store</h2>
        <p className="mla-lede">
          Unlike every subsystem above, catalog persistence and the 14 subsystems built on top of it
          (inventory, the named Catalog entity, cart, orders, customer profiles, promotions, reviews,
          storefront views, bundles, recommendations, advertising, service areas, the internal BI event
          log, and fulfillment routing) are each resolved separately per demo store
          (per-demo-backend-diversity and full-commerce-persistence-audit epics) &mdash; each store can
          genuinely run a different real database, not one process-wide choice. This table proves it live,
          computed fresh per demo on every request; every one of these rows besides &ldquo;Persistence
          (catalog)&rdquo; is Postgres-only in this pass (real Mongo/Convex/SQLite equivalents are out of
          scope, see lib/services.ts&rsquo;s own doc comments), so each shows either &ldquo;Postgres&rdquo;
          or the in-memory reference default.
        </p>
        <div className="mla-table-wrap">
          <table className="mla-table">
            <thead>
              <tr>
                <th>Subsystem</th>
                {DEMO_SLUGS.map((slug) => (
                  <th key={slug}>{DEMO_REGISTRY[slug].displayName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perDemoSubsystemRows.map((row) => (
                <tr key={row.subsystem}>
                  <td className="mla-subsystem">{row.subsystem}</td>
                  {row.bySlug.map(({ slug, info }) => (
                    <td key={slug}>
                      <span className="mla-badge">{info.adapter}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mla-section">
        <h2>The flagship example: payments</h2>
        <p>
          <code>packages/payments/src/types.ts</code> defines the whole contract every payment provider
          implements &mdash; three methods, nothing more:
        </p>
        <pre className="mla-code">{PAYMENT_ADAPTER_SNIPPET}</pre>
        <p>
          Two real implementations exist today. <code>createStripeAdapter()</code> (
          <code>packages/payments/src/stripe-adapter.ts</code>) wraps real Stripe Checkout Sessions and
          verified Stripe webhooks. <code>createSandboxPaymentAdapter()</code> (
          <code>packages/payments/src/sandbox-adapter.ts</code>) is a second, fully-working adapter with no
          external provider and no API key at all &mdash; it redirects the shopper to this app&rsquo;s own{" "}
          <code>/demo/&lt;slug&gt;/checkout/sandbox</code> page, and once they click &ldquo;Pay,&rdquo; a
          server action calls that adapter&rsquo;s own <code>confirmSandboxPayment()</code>, which publishes
          the exact same <code>payments.payment.succeeded</code> event a verified Stripe webhook would. From{" "}
          <code>checkout-orders</code>&rsquo;s point of view, the two adapters are indistinguishable &mdash;
          same event, same order-status transition, zero special-casing.
        </p>
        <p>
          <code>lib/services.ts</code> picks between them with one <code>if</code>: real Stripe when{" "}
          <code>STRIPE_SECRET_KEY</code> is set, the sandbox adapter otherwise &mdash; the same shape the table
          above just showed you live, for real, for this deployment&rsquo;s Payments row.
        </p>
      </section>

      <section className="mla-section">
        <h2>The same pattern, repeated across every subsystem</h2>
        <p>
          Payments isn&rsquo;t a special case &mdash; it&rsquo;s just the easiest one to demo end-to-end.
          Every other row in the table above has the same shape: one interface, a zero-infra reference
          default, and a real alternate package that swaps in via an env var.
        </p>
        <div className="mla-grid">
          {ADAPTER_PAIRS.map((pair) => (
            <div className="ml-card mla-pair-card" key={pair.subsystem}>
              <h3>{pair.subsystem}</h3>
              <div className="mla-pair-row">
                <span className="mla-pair-tag mla-pair-default">{pair.reference}</span>
                <span className="mla-pair-arrow" aria-hidden="true">
                  &harr;
                </span>
                <span className="mla-pair-tag mla-pair-alt">{pair.alternate}</span>
              </div>
              <p>{pair.note}</p>
            </div>
          ))}
        </div>
        <p className="mla-caveat">
          Registering an alternate adapter package isn&rsquo;t automatically the same as every order routing
          to it &mdash; fulfillment and shipping, for example, still default every SKU to the manual workflow
          until an operator explicitly routes it elsewhere. The point isn&rsquo;t that every provider is live
          in this one environment; it&rsquo;s that the interface these packages implement is the actual
          integration surface, proven by more than one real implementation existing for it.
        </p>
      </section>
    </div>
  );
}

const PAYMENT_ADAPTER_SNIPPET = `interface PaymentAdapter {
  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  confirmPayment(sessionId: string): Promise<PaymentConfirmation>;
  handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void>;
}`;

const ADAPTER_PAIRS = [
  {
    subsystem: "Persistence (catalog)",
    reference: "SQLite (in-memory / file-backed)",
    alternate: "Postgres (packages/adapter-postgres)",
    note: "DATABASE_URL set switches the whole catalog/cart/CMS persistence layer to Postgres -- same repository interfaces, different storage engine.",
  },
  {
    subsystem: "CMS",
    reference: "In-memory CMS (packages/cms)",
    alternate: "Sanity (packages/adapter-sanity)",
    note: "SANITY_PROJECT_ID set swaps every page/component read and write onto real Sanity content, with no change to how pages are rendered.",
  },
  {
    subsystem: "Payments",
    reference: "Sandbox adapter (packages/payments)",
    alternate: "Stripe (packages/payments)",
    note: "The flagship example above -- STRIPE_SECRET_KEY set is the only difference between a real charge and a fully-working, zero-infra demo checkout.",
  },
  {
    subsystem: "Fulfillment",
    reference: "Manual self-fulfillment (packages/fulfillment)",
    alternate: "Printful / Printify (packages/adapter-printful, packages/adapter-printify)",
    note: "PRINTFUL_API_TOKEN / PRINTIFY_API_TOKEN + PRINTIFY_SHOP_ID additively register real print-on-demand providers alongside the manual default.",
  },
  {
    subsystem: "Shipping",
    reference: "Manual (documented PirateShip workflow, packages/shipping)",
    alternate: "Shippo (packages/adapter-shippo)",
    note: "SHIPPO_API_TOKEN set additionally registers a real Shippo-backed rate/label adapter alongside the manual default.",
  },
] as const;

const ARCHITECTURE_CSS = `
  .mla-page { padding: 64px 0 96px; }
  .mla-intro { max-width: 760px; margin-bottom: 44px; }
  .mla-intro h1 { font-size: clamp(2rem, 4vw, 2.6rem); }
  .mla-intro p { font-size: 1.02rem; }

  .mla-section { margin-bottom: 56px; }
  .mla-section h2 { font-size: 1.4rem; margin-bottom: 14px; }
  .mla-lede { max-width: 780px; }
  .mla-lede strong { color: var(--ml-ink); }

  .mla-table-wrap { overflow-x: auto; border: 1px solid var(--ml-border); border-radius: var(--ml-radius); background: var(--ml-bg-alt); box-shadow: var(--ml-shadow); }
  .mla-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 640px; }
  .mla-table th { text-align: left; font-family: var(--ml-font-body); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ml-ink-faint); padding: 14px 18px; border-bottom: 1px solid var(--ml-border); }
  .mla-table td { padding: 14px 18px; border-bottom: 1px solid var(--ml-border); vertical-align: top; }
  .mla-table tr:last-child td { border-bottom: none; }
  .mla-subsystem { font-weight: 600; white-space: nowrap; }
  .mla-badge { display: inline-block; background: var(--ml-primary-soft); color: var(--ml-primary); font-weight: 600; font-size: 0.82rem; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .mla-detail { color: var(--ml-ink-soft); font-size: 0.86rem; }

  .mla-code {
    background: #14161f; color: #e6e6f0; font-family: var(--ml-font-mono); font-size: 0.82rem;
    padding: 18px 20px; border-radius: var(--ml-radius-sm); overflow-x: auto; line-height: 1.6;
  }

  .mla-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 18px; }
  .mla-pair-card h3 { font-size: 1rem; margin-bottom: 10px; }
  .mla-pair-card p { font-size: 0.86rem; margin-bottom: 0; }
  .mla-pair-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .mla-pair-tag { font-family: var(--ml-font-mono); font-size: 0.76rem; padding: 5px 9px; border-radius: 6px; }
  .mla-pair-default { background: var(--ml-primary-soft); color: var(--ml-primary); }
  .mla-pair-alt { background: var(--ml-accent-soft); color: var(--ml-accent); }
  .mla-pair-arrow { color: var(--ml-ink-faint); }

  .mla-caveat { margin-top: 18px; font-size: 0.88rem; color: var(--ml-ink-soft); border-left: 3px solid var(--ml-border); padding-left: 14px; }

  @media (max-width: 780px) {
    .mla-grid { grid-template-columns: 1fr; }
  }
`;
