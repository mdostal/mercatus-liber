import { notFound } from "next/navigation";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { checkout } = await getServices();
  const order = await checkout.getOrder(id);
  if (!order) notFound();

  return (
    <main>
      <h1>Order {order.id}</h1>
      <p>Status: {order.status}</p>
      <ul>
        {order.items.map((item) => (
          <li key={item.skuId}>
            SKU {item.skuId} x{item.quantity} -- {((item.priceAtPurchase.amount * item.quantity) / 100).toFixed(2)}{" "}
            {item.priceAtPurchase.currency}
          </li>
        ))}
      </ul>
    </main>
  );
}
