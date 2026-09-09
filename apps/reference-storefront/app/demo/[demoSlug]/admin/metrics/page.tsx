import Link from "next/link";
import type { AnalyticsInsightsRange, PageViewRow, TopReferrerRow, TrafficSourceRow } from "@mercatus-liber/analytics";
import type { Money } from "@mercatus-liber/core";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo, type InsightsSource } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

function formatMoney(money: Money): string {
  return `${(money.amount / 100).toFixed(2)} ${money.currency}`;
}

interface ConfiguredInsights {
  source: InsightsSource;
  trafficSources: TrafficSourceRow[];
  pageViews: PageViewRow[];
  topReferrers: TopReferrerRow[];
}

/**
 * Loads all three AnalyticsInsightsAdapter methods for every CONFIGURED
 * source only -- an unconfigured source's noop adapter would also resolve
 * with real empty arrays, so calling it here would be indistinguishable from
 * "configured but genuinely no traffic in range" once rendered. See
 * `InsightsSource.configured` in lib/services.ts and design-discussion.md
 * §1c: every configured source is shown side by side, explicitly labeled,
 * never merged/summed into a blended number.
 */
async function loadConfiguredInsights(sources: InsightsSource[], range: AnalyticsInsightsRange): Promise<ConfiguredInsights[]> {
  const configured = sources.filter((source) => source.configured);
  return Promise.all(
    configured.map(async (source) => {
      const [trafficSources, pageViews, topReferrers] = await Promise.all([
        source.adapter.getTrafficSources(range),
        source.adapter.getPageViews(range),
        source.adapter.getTopReferrers(range),
      ]);
      return { source, trafficSources, pageViews, topReferrers };
    }),
  );
}

export default async function AdminMetricsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { bi, insightsSources } = await getServicesForDemo(demoSlug);

  // This is a low-volume demo app with no meaningful history, so a wide
  // 365-day window is simplest -- effectively "all-time" for a reference
  // implementation that's only ever run for a short demo session.
  const now = new Date();
  const range = {
    from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };

  const [revenueOverTime, orderVolume, topProducts, conversionFunnel, promotionRedemptionRates, inventoryTurns, configuredInsights] =
    await Promise.all([
      bi.getRevenueOverTime(range, "day"),
      bi.getOrderVolume(range),
      bi.getTopProducts(range),
      bi.getConversionFunnel(range),
      bi.getPromotionRedemptionRates(),
      bi.getInventoryTurns(range),
      loadConfiguredInsights(insightsSources, range),
    ]);

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Metrics</h1>

      <section>
        <h2>Revenue over time</h2>
        {revenueOverTime.length === 0 ? (
          <p>No revenue recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {revenueOverTime.map((row) => (
                <tr key={row.bucket}>
                  <td>{row.bucket}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Order volume</h2>
        <p>Total orders: {orderVolume.total}</p>
        {Object.keys(orderVolume.byStatus).length === 0 ? (
          <p>No orders recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(orderVolume.byStatus).map(([status, count]) => (
                <tr key={status}>
                  <td>{status}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Top products</h2>
        {topProducts.length === 0 ? (
          <p>No product sales recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Units sold</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product) => (
                <tr key={product.productId}>
                  <td>{product.title}</td>
                  <td>{product.unitsSold}</td>
                  <td>{formatMoney(product.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Conversion funnel</h2>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {conversionFunnel.map((stage) => (
              <tr key={stage.stage}>
                <td>{stage.stage}</td>
                <td>{stage.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Promotion redemption rates</h2>
        {promotionRedemptionRates.length === 0 ? (
          <p>No promotions configured yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Redemptions</th>
                <th>Usage limit</th>
              </tr>
            </thead>
            <tbody>
              {promotionRedemptionRates.map((promotion) => (
                <tr key={promotion.promotionId}>
                  <td>{promotion.code ?? "(auto)"}</td>
                  <td>{promotion.redemptionCount}</td>
                  <td>{promotion.usageLimit ?? "unlimited"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Inventory turns</h2>
        {/* getInventoryTurns always resolves null in this reference implementation -- see
            packages/internal-bi/src/service.ts and design-discussion.md §4. This note must
            always render here, never a fabricated number. */}
        <p>
          {inventoryTurns === null
            ? "Inventory turns: not available in this reference implementation -- no inventory movement history is tracked"
            : inventoryTurns}
        </p>
      </section>

      <section>
        <h2>Traffic & Sources</h2>
        {/* Every configured source (PostHog, GA4, ...) is rendered in its own
            fully-labeled subsection below, never merged/summed into one
            number -- see design-discussion.md §1c: different tools count
            traffic differently (bot filtering, session definitions,
            attribution windows), so a single blended figure would be
            actively misleading. */}
        {configuredInsights.length === 0 ? (
          <p>
            Traffic & Sources is not configured for this demo. Set POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID for
            PostHog, and/or GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_EMAIL + GA4_PRIVATE_KEY for Google Analytics (GA4),
            to see real traffic-source data from that provider here.
          </p>
        ) : (
          configuredInsights.map(({ source, trafficSources, pageViews, topReferrers }) => (
            <div key={source.provider}>
              <h3>{source.label}</h3>

              <h4>Traffic sources</h4>
              {trafficSources.length === 0 ? (
                <p>No traffic-source data for this range.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficSources.map((row) => (
                      <tr key={row.source}>
                        <td>{row.source}</td>
                        <td>{row.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4>Page views</h4>
              {pageViews.length === 0 ? (
                <p>No page-view data for this range.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageViews.map((row) => (
                      <tr key={row.path}>
                        <td>{row.path}</td>
                        <td>{row.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4>Top referrers</h4>
              {topReferrers.length === 0 ? (
                <p>No referrer data for this range.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Referrer</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topReferrers.map((row) => (
                      <tr key={row.referrer}>
                        <td>{row.referrer}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
        {configuredInsights.length > 0 && insightsSources.some((source) => !source.configured) && (
          <p>
            Also available but not configured: {insightsSources
              .filter((source) => !source.configured)
              .map((source) => source.label)
              .join(", ")}
            .
          </p>
        )}
      </section>
    </main>
  );
}
