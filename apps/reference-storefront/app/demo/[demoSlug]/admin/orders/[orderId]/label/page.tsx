import Link from "next/link";
import { notFound } from "next/navigation";
import { buyOrderLabelAction, voidOrderLabelAction } from "../../../../../../../lib/actions";
import { isDemoSlug } from "../../../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../../../lib/services";
import { parcelFromForm } from "../../../../../../../lib/shipping-labels";

export const dynamic = "force-dynamic";

const money = (amount: { amount: number; currency: string }): string => `${(amount.amount / 100).toFixed(2)} ${amount.currency}`;

/** Only an https link is rendered as a link, so a tampered query string cannot plant a `javascript:` URL in the page. */
const safeUrl = (raw: string | undefined): string | null => {
  try {
    return raw && new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
};

/**
 * Buy a carrier label for the lines of one order the store ships itself.
 *
 * The operator enters the box's weight and size, the page asks the shipping
 * provider for rates, and each rate has its own "Buy" button. Buying marks the
 * order's waiting self-shipped lines as shipped with the label's tracking
 * number and publishes `fulfillment.order.status_changed`. A label that has
 * not been used can be voided here, which puts the lines back.
 *
 * Rates are fetched while rendering, from the numbers in the URL, so a rate is
 * only ever bought from a page that just quoted it.
 */
export default async function OrderLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ demoSlug: string; orderId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { demoSlug, orderId: rawOrderId } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const orderId = decodeURIComponent(rawOrderId);
  const query = await searchParams;
  const { checkout, orderLabels, fulfillment } = await getServicesForDemo(demoSlug);
  const order = await checkout.getOrder(orderId);
  if (!order) notFound();

  const waiting = orderLabels.available ? (await fulfillment.listForOrder(orderId)).filter((record) => record.provider === "manual" && record.status === "submitted") : [];
  const voidable = orderLabels.available ? await orderLabels.labelsForOrder(orderId) : [];
  const asked = query.weightOz !== undefined;
  const parsed = asked ? parcelFromForm(query) : null;
  const quote = orderLabels.available && parsed && "parcel" in parsed && waiting.length > 0 ? await orderLabels.service.quote(orderId, parsed.parcel) : null;
  const labelUrl = safeUrl(query.label);

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/orders`}>← Orders</Link>
      </p>
      <h1>Shipping label for order {orderId}</h1>

      {query.bought ? (
        <p role="status" style={{ border: "1px solid #2e7d32", padding: 8 }}>
          Label bought{query.carrier ? ` with ${query.carrier}` : ""}. Tracking number: <strong>{query.bought}</strong>.{" "}
          {labelUrl ? (
            <a href={labelUrl} target="_blank" rel="noopener noreferrer">
              Open the label to print it
            </a>
          ) : null}
        </p>
      ) : null}
      {query.voided ? (
        <p role="status" style={{ border: "1px solid #2e7d32", padding: 8 }}>
          {query.voided === "pending" ? "The provider accepted the void and is processing the refund." : "Label voided."} The order's lines are waiting for a label again.
        </p>
      ) : null}
      {query.warning ? (
        <p role="alert" style={{ border: "1px solid #b26a00", padding: 8 }}>
          {query.warning}
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" style={{ border: "1px solid #c62828", padding: 8 }}>
          {query.error}
        </p>
      ) : null}

      {!orderLabels.available ? (
        <p>Labels are off for this store. {orderLabels.reason}</p>
      ) : (
        <>
          <p>
            Provider: {orderLabels.provider}. Ships to {order.shippingInfo.name}, {order.shippingInfo.address}.
          </p>

          {voidable.length > 0 ? (
            <section>
              <h2>Labels on this order</h2>
              <p>A label can be voided until the carrier has scanned the parcel.</p>
              {voidable.map((labelId) => (
                <form key={labelId} action={voidOrderLabelAction} style={{ marginBottom: 4 }}>
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="labelId" value={labelId} />
                  <button type="submit">Void label {labelId.slice(0, 8)}…</button>
                </form>
              ))}
            </section>
          ) : null}

          <section>
            <h2>Get rates</h2>
            {waiting.length === 0 ? (
              <p>No line of this order is waiting for a label. Lines appear here once the order is submitted for fulfillment and routed to the store itself.</p>
            ) : (
              <>
                <p>
                  This label will cover: {waiting.map((record) => record.skuId).join(", ")}.
                </p>
                <form method="get" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                  <label>
                    Weight (oz) <input id="label-weight" type="number" name="weightOz" min="0.1" step="0.1" required defaultValue={query.weightOz ?? ""} style={{ width: 80 }} />
                  </label>
                  <label>
                    Length (in) <input id="label-length" type="number" name="lengthIn" min="0.1" step="0.1" required defaultValue={query.lengthIn ?? ""} style={{ width: 70 }} />
                  </label>
                  <label>
                    Width (in) <input id="label-width" type="number" name="widthIn" min="0.1" step="0.1" required defaultValue={query.widthIn ?? ""} style={{ width: 70 }} />
                  </label>
                  <label>
                    Height (in) <input id="label-height" type="number" name="heightIn" min="0.1" step="0.1" required defaultValue={query.heightIn ?? ""} style={{ width: 70 }} />
                  </label>
                  <button type="submit">Get rates</button>
                </form>
              </>
            )}
            {parsed && "error" in parsed ? <p role="alert">{parsed.error}</p> : null}
          </section>

          {quote ? (
            <section>
              <h2>Rates</h2>
              {!quote.available ? (
                <p role="alert">{quote.reason}</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Carrier</th>
                      <th>Service</th>
                      <th>Price</th>
                      <th>Days</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...quote.rates]
                      .sort((a, b) => a.amount.amount - b.amount.amount)
                      .map((rate) => (
                        <tr key={rate.rateId}>
                          <td>{rate.carrier}</td>
                          <td>{rate.serviceLevel}</td>
                          <td>{money(rate.amount)}</td>
                          <td>{rate.estimatedDays ?? "—"}</td>
                          <td>
                            <form action={buyOrderLabelAction}>
                              <input type="hidden" name="demoSlug" value={demoSlug} />
                              <input type="hidden" name="orderId" value={orderId} />
                              <input type="hidden" name="rateId" value={rate.rateId} />
                              <button type="submit">Buy this label</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
