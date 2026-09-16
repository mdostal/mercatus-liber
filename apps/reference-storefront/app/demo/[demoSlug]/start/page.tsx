import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_REGISTRY, isDemoSlug, type DemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";
import { getAdapterInfo } from "../../../../lib/adapter-info";
import { canonicalUrl } from "../../../../lib/site-url";

export const dynamic = "force-dynamic";

/**
 * per-store-landing-and-onboarding epic (backlog 54): a real "start here"
 * page for a first-time reviewer stepping into one of these demo stores --
 * a per-user ask ("the login, the metrics, how to play with it, how to see
 * the things") because everything this framework can do was otherwise only
 * discoverable by already knowing where to look (buried admin-panel
 * routes, a promo code nobody would guess, an /architecture page that
 * isn't linked from inside the shop itself). This page is the one place
 * that actually tells a visitor what to do next.
 *
 * Deliberately reads everything live from this store's own real services
 * rather than hardcoding copy: the admin password comes straight from
 * `process.env.ADMIN_DEV_PASSWORD` (the same value packages/admin-auth's
 * dev-default adapter itself checks against -- see its own doc comment on
 * why publishing this value here is the correct, intended behavior for a
 * public reviewer demo, not a leak: this IS the public gate for this
 * specific project's own admin panels, deliberately, since there's no
 * per-visitor account system and the whole point is letting a stranger
 * explore without contacting the site owner first), the promo code(s) come
 * from a real, currently-active `PromotionsService.listPromotions()` call
 * (never a hardcoded string that could silently drift from actual seed
 * data), and the adapter status table reuses the exact same
 * `getAdapterInfo()` the /architecture page renders (this deployment's
 * real, live wiring, not a claim).
 */
export async function generateMetadata({ params }: { params: Promise<{ demoSlug: string }> }): Promise<Metadata> {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) return {};
  const demo = DEMO_REGISTRY[demoSlug];
  const path = `/demo/${demoSlug}/start`;
  return {
    title: "Start Here",
    description: `A real "start here" guide to ${demo.displayName} -- admin login, live metrics, a real promo code, the sandbox checkout flow, and what this store specifically demonstrates.`,
    alternates: { canonical: canonicalUrl(path) },
  };
}

/**
 * One real, seeded, load-bearing highlight per store -- not generic praise.
 * Each entry names an actual route and the actual capability behind it, so
 * a visitor can go verify the claim in one click rather than take it on
 * faith. Kept intentionally short (3 items) so this stays a genuine
 * curated list, not a re-statement of the whole /architecture page.
 */
const STORE_HIGHLIGHTS: Record<DemoSlug, { label: string; href: (slug: DemoSlug) => string; blurb: string }[]> = {
  "print-shop": [
    {
      label: "Real product personalization",
      href: (slug) => `/demo/${slug}/products/embroidered-canvas-tote`,
      blurb:
        'Several products (look for "Embroidered...") carry a real customization text field that flows into the cart line -- not just a decorative option, a genuine per-order note.',
    },
    {
      label: "Reviews with real moderation",
      href: (slug) => `/demo/${slug}/products/embroidered-canvas-tote`,
      blurb: 'A real submit -> pending -> admin-moderate -> published loop. Try submitting one, then check Admin -> Reviews.',
    },
    {
      label: '"Corporate & Bulk Orders" -- a second storefront, same catalog',
      href: (slug) => `/demo/${slug}/site/corporate-bulk`,
      blurb: "A genuinely different curated storefront over this exact same catalog and inventory -- its own theme, its own hero, its own nav.",
    },
  ],
  northline: [
    {
      label: "Real service-area location pages",
      href: (slug) => `/demo/${slug}/locations`,
      blurb: "City/region pages distinct from product categories -- the multi-location pattern a real local-install business needs.",
    },
    {
      label: '"Commercial & Multi-Unit Installs" -- a B2B split, same catalog',
      href: (slug) => `/demo/${slug}/site/commercial`,
      blurb: "A property-manager-facing storefront curated from the same install/security/networking catalog the consumer site sells from.",
    },
    {
      label: "Installed-service bundles",
      href: (slug) => `/demo/${slug}`,
      blurb: "Multi-tier service+install bundles sold from a single PDP, not just single-SKU products.",
    },
  ],
  broadleaf: [
    {
      label: "Real multi-SKU tiered variants",
      href: (slug) => `/demo/${slug}`,
      blurb: 'Look for a plant with multiple size/price tiers on one PDP (e.g. "Trailing Pothos") -- each tier is its own real SKU with its own stock.',
    },
    {
      label: '"Autumn Harvest & Gift Guide" -- a real time-boxed homepage takeover',
      href: (slug) => `/demo/${slug}/site/autumn-gift-guide`,
      blurb:
        "isDefaultOverride: true with a genuine startsAt/endsAt window (Oct 1 - Nov 30) -- this view REPLACES the store's own home page automatically while its window is live, and reverts automatically after, with no manual step. Its own /site/ URL is only reachable during that same window, by design.",
    },
    {
      label: "Reviews with real moderation",
      href: (slug) => `/demo/${slug}`,
      blurb: "Same real submit -> pending -> admin-moderate -> published loop as every other store here.",
    },
  ],
};

export default async function StartHerePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const demo = DEMO_REGISTRY[demoSlug];

  const { promotions } = await getServicesForDemo(demoSlug);
  const allPromotions = await promotions.listPromotions();
  const activeCodes = allPromotions.filter((promo) => promo.code && promo.status === "active");

  const adapters = getAdapterInfo();
  const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);
  const adminDevPassword = process.env.ADMIN_DEV_PASSWORD ?? null;

  return (
    <main className="ml-shell mlsh-page">
      <style>{PAGE_CSS}</style>

      <section className="mlsh-hero">
        <span className="ml-eyebrow">Start Here</span>
        <h1>A real, self-guided tour of {demo.displayName}</h1>
        <p>
          Everything below is live and real -- not a mockup. This page exists so you don&rsquo;t have to guess where
          the interesting parts are.
        </p>
      </section>

      <div className="mlsh-grid">
        <section className="ml-card mlsh-card">
          <h2>1. Log into the admin panel</h2>
          {clerkConfigured ? (
            <p>
              This deployment authenticates admin access via <strong>Clerk</strong>. Visit{" "}
              <Link href={`/demo/${demoSlug}/admin`}>{`/demo/${demoSlug}/admin`}</Link> and sign in (or create an
              account) through Clerk&rsquo;s own hosted flow.
            </p>
          ) : adminDevPassword ? (
            <>
              <p>
                This deployment uses the zero-infra dev-default admin login (no Clerk account configured here) --
                the real, current password is:
              </p>
              <p className="mlsh-code-block">{adminDevPassword}</p>
              <p>
                Visit <Link href={`/demo/${demoSlug}/admin`}>{`/demo/${demoSlug}/admin`}</Link> and enter it. This
                unlocks catalog, CMS, promotions, bundles, recommendations, advertising, reviews, storefront views,
                and metrics management for this store.
              </p>
            </>
          ) : (
            <p>
              No admin authentication is currently configured on this deployment (neither Clerk nor a dev
              password) -- the admin panel is unreachable right now.
            </p>
          )}
        </section>

        <section className="ml-card mlsh-card">
          <h2>2. See real business metrics</h2>
          <p>
            <Link href={`/demo/${demoSlug}/admin/metrics`}>{`/demo/${demoSlug}/admin/metrics`}</Link> -- revenue over
            time, order volume, top products, a real conversion funnel, promotion redemption rates, and (once
            traffic exists) PostHog/GA4 traffic-source insights, all computed live from this store&rsquo;s own real
            order/cart/catalog data, never mocked. Requires the admin login above.
          </p>
        </section>

        <section className="ml-card mlsh-card">
          <h2>3. Check out with a real promo code</h2>
          {activeCodes.length > 0 ? (
            <>
              <p>Add something to your cart, then try one of these real, currently-active codes at checkout:</p>
              <ul className="mlsh-code-list">
                {activeCodes.map((promo) => (
                  <li key={promo.id} className="mlsh-code-block mlsh-code-inline">
                    {promo.code}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No promo code is currently active for this store.</p>
          )}
          <p>
            Checkout is a real, fully-working <strong>sandbox</strong> -- no external payment provider is
            configured on this deployment, so nothing is ever actually charged, but the whole cart-&gt;checkout-
            &gt;order flow is genuine, including the coupon code above.
          </p>
        </section>

        <section className="ml-card mlsh-card">
          <h2>4. What {demo.displayName} specifically demonstrates</h2>
          <ul className="mlsh-highlight-list">
            {STORE_HIGHLIGHTS[demoSlug].map((item) => (
              <li key={item.label}>
                <Link href={item.href(demoSlug)}>{item.label}</Link>
                <p>{item.blurb}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="ml-card mlsh-card mlsh-adapters">
          <h2>5. What&rsquo;s actually running behind this store, right now</h2>
          <p>
            This deployment&rsquo;s real, live adapter wiring (shared process-wide across all 3 demo stores) --
            see the full <Link href="/architecture">Architecture &amp; Adapters</Link> page for how the swap
            mechanism itself works.
          </p>
          <table className="mlsh-adapter-table">
            <tbody>
              {adapters.map((row) => (
                <tr key={row.subsystem}>
                  <td>{row.subsystem}</td>
                  <td>
                    <span className={`mlsh-badge mlsh-badge-${row.status}`}>{row.adapter}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="mlsh-footer-link">
        <Link href={`/demo/${demoSlug}`}>&larr; Back to the shop</Link>
      </p>
    </main>
  );
}

const PAGE_CSS = `
  .mlsh-page { padding-block: 32px 56px; }
  .mlsh-hero { max-width: 68ch; margin-bottom: 28px; }
  .mlsh-hero h1 { margin: 8px 0 10px; }
  .mlsh-grid { display: grid; gap: 20px; }
  .mlsh-card h2 { font-size: 1.05rem; margin: 0 0 10px; }
  .mlsh-card p { margin: 0 0 10px; }
  .mlsh-card p:last-child { margin-bottom: 0; }
  .mlsh-code-block {
    display: inline-block;
    font-family: var(--ml-font-mono, ui-monospace, monospace);
    background: var(--ml-bg-alt, #f4f3ef);
    border: 1px solid var(--ml-border, #ddd);
    border-radius: 6px;
    padding: 6px 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .mlsh-code-list { list-style: none; padding: 0; margin: 0 0 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  .mlsh-code-inline { margin: 0; }
  .mlsh-highlight-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
  .mlsh-highlight-list li a { font-weight: 600; }
  .mlsh-highlight-list li p { margin: 4px 0 0; font-size: 0.9rem; color: var(--ml-ink-soft); }
  .mlsh-adapter-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .mlsh-adapter-table td { padding: 6px 4px; border-top: 1px solid var(--ml-border, #ddd); font-size: 0.88rem; }
  .mlsh-adapter-table td:first-child { font-weight: 600; width: 45%; }
  .mlsh-badge {
    display: inline-block; background: var(--ml-primary-soft); color: var(--ml-primary);
    font-weight: 600; font-size: 0.8rem; padding: 3px 10px; border-radius: 999px;
  }
  .mlsh-footer-link { margin-top: 28px; }

  @media (min-width: 760px) {
    .mlsh-grid { grid-template-columns: repeat(2, 1fr); }
    .mlsh-adapters { grid-column: 1 / -1; }
  }
`;
