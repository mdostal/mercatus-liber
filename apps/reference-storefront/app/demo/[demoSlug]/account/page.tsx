import { notFound } from "next/navigation";
import { readCustomerId } from "../../../../lib/customer-cookie";
import { isDemoSlug } from "../../../../lib/demos";
import { getServicesForDemo } from "../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const customerId = await readCustomerId();

  if (!customerId) {
    return (
      <main>
        <h1>Account</h1>
        <p>No demo account yet -- complete a checkout to create one.</p>
      </main>
    );
  }

  const { account } = await getServicesForDemo(demoSlug);
  const [profile, orders, activity] = await Promise.all([
    account.getProfile(customerId),
    account.listOrders(customerId),
    account.listRecentActivity(customerId),
  ]);

  return (
    <main>
      <h1>Account</h1>
      <p style={{ color: "#666" }}>
        Demo account (no real auth -- see docs/subsystems/10-customer-account.md open question 1).{" "}
        {profile?.email}
      </p>

      <h2>Order history</h2>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul>
          {orders.map((order) => (
            <li key={order.id}>
              <a href={`/demo/${demoSlug}/order/${order.id}`}>{order.id}</a> -- {order.status} ({order.itemCount} item
              {order.itemCount === 1 ? "" : "s"})
            </li>
          ))}
        </ul>
      )}

      <h2>Recent activity</h2>
      {activity.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <ul>
          {activity.map((entry, i) => (
            <li key={i}>
              Order {entry.orderId} -- {entry.status} at {entry.at}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
