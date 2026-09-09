import Link from "next/link";
import type { Money } from "@mercatus-liber/core";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

function formatMoney(money: Money): string {
  return `${(money.amount / 100).toFixed(2)} ${money.currency}`;
}

export default async function AdminMetricsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { bi } = await getServicesForDemo(demoSlug);

  // This is a low-volume demo app with no meaningful history, so a wide
  // 365-day window is simplest -- effectively "all-time" for a reference
  // implementation that's only ever run for a short demo session.
  const now = new Date();
  const range = {
    from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };

  const [revenueOverTime, orderVolume, topProducts, conversionFunnel, promotionRedemptionRates, inventoryTurns] =
    await Promise.all([
      bi.getRevenueOverTime(range, "day"),
      bi.getOrderVolume(range),
      bi.getTopProducts(range),
      bi.getConversionFunnel(range),
      bi.getPromotionRedemptionRates(),
      bi.getInventoryTurns(range),
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
    </main>
  );
}
