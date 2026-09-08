import Link from "next/link";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { checkout } = await getServices();
  const orders = await checkout.listOrders();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: Orders</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Customer</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link href={`/order/${order.id}`}>{order.id}</Link>
              </td>
              <td>{order.status}</td>
              <td>{order.customerId ?? "guest"}</td>
              <td>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
