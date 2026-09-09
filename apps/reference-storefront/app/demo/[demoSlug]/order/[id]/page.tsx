import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { checkout } = await getServicesForDemo(demoSlug);
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
            {/* print-shop-02: the cart line's personalization text, carried through checkout onto the order record (design-discussion.md §1b). */}
            {item.customizationNote && <div>Personalization: {item.customizationNote}</div>}
          </li>
        ))}
      </ul>
    </main>
  );
}
