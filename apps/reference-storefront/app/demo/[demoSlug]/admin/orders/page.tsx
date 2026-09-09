import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { markFulfillmentLineShippedAction, submitOrderForFulfillmentAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

/**
 * fulfillment-02: a real extension of this repo's existing list-only
 * `/admin/orders` page, not a new standalone `/admin/fulfillment` page (the
 * story's own choice to make, documented here). An operator looking at an
 * order to fulfill it wants the order and its lines' routing/status/
 * mark-shipped controls together in one place -- splitting them into two
 * pages would just force jumping back and forth correlating order ids by
 * hand for every single order, with no real benefit (unlike promotions/
 * bundles/recommendations/advertising, which are independently-listed admin
 * entities in their own right, an order's fulfillment record only makes
 * sense in the context of that specific order). This mirrors the same
 * reasoning `/order/[id]` (the shopper-facing order lookup page) already
 * takes: order + its line items rendered together, not split apart.
 *
 * Every order's per-line routing (defaulting to "manual" -- see
 * @mercatus-liber/fulfillment's FulfillmentRoutingRepository) and status is
 * computed here, not just pulled off whatever FulfillmentLineRecords
 * already exist: a line with no record yet (this order was never routed &
 * submitted for fulfillment) still needs to show its real routed provider
 * and a synthesized "unfulfilled" status, not just disappear from the
 * table -- see docs/subsystems/22-fulfillment.md.
 */
export default async function AdminOrdersPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { checkout, fulfillment, fulfillmentRouting } = await getServicesForDemo(demoSlug);
  const orders = await checkout.listOrders();

  const orderViews = await Promise.all(
    orders.map(async (order) => {
      const records = await fulfillment.listForOrder(order.id);
      const lines = await Promise.all(
        order.items.map(async (item) => {
          const record = records.find((r) => r.skuId === item.skuId) ?? null;
          const provider = record?.provider ?? (await fulfillmentRouting.getProviderForSku(item.skuId));
          const status = record?.status ?? "unfulfilled";
          return { skuId: item.skuId, quantity: item.quantity, provider, status, record };
        }),
      );
      return { order, lines, submitted: records.length > 0 };
    }),
  );

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Orders &amp; Fulfillment</h1>

      {orderViews.map(({ order, lines, submitted }) => (
        <section key={order.id} style={{ border: "1px solid #ccc", borderRadius: 4, padding: 12, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1em" }}>
            <Link href={`/order/${order.id}`}>{order.id}</Link>{" "}
            <span style={{ fontWeight: "normal", color: "#666" }}>
              ({order.status}, {order.customerId ?? "guest"})
            </span>
          </h2>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Qty</th>
                <th>Fulfillment provider</th>
                <th>Fulfillment status</th>
                <th>Tracking</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.skuId}>
                  <td>{line.skuId}</td>
                  <td>{line.quantity}</td>
                  <td>{line.provider}</td>
                  <td>{line.status}</td>
                  <td>
                    {line.record?.trackingNumber
                      ? line.record.trackingUrl
                        ? <a href={line.record.trackingUrl}>{line.record.trackingNumber}</a>
                        : line.record.trackingNumber
                      : "—"}
                  </td>
                  <td>
                    {line.status === "submitted" ? (
                      <form action={markFulfillmentLineShippedAction} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input type="hidden" name="demoSlug" value={demoSlug} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="skuId" value={line.skuId} />
                        <input type="text" name="trackingNumber" placeholder="Tracking #" size={12} />
                        <input type="text" name="trackingUrl" placeholder="Tracking URL" size={16} />
                        <button type="submit">Mark shipped</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!submitted ? (
            <form action={submitOrderForFulfillmentAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="demoSlug" value={demoSlug} />
              <input type="hidden" name="orderId" value={order.id} />
              <button type="submit">Route &amp; submit for fulfillment</button>
            </form>
          ) : null}
        </section>
      ))}
    </main>
  );
}
