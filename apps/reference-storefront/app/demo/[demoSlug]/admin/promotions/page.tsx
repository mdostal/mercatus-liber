import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { deactivatePromotionAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { promotions } = await getServicesForDemo(demoSlug);
  const allPromotions = await promotions.listPromotions();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Promotions</h1>
      <p>
        <Link href={`/demo/${demoSlug}/admin/promotions/new`}>+ New promotion</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Kind</th>
            <th>Scope</th>
            <th>Value</th>
            <th>Status</th>
            <th>Redemptions</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allPromotions.map((promotion) => (
            <tr key={promotion.id}>
              <td>{promotion.code ?? "(auto)"}</td>
              <td>{promotion.kind}</td>
              <td>{promotion.scope}</td>
              <td>{promotion.value}</td>
              <td>{promotion.status}</td>
              <td>
                {promotion.redemptionCount}/{promotion.usageLimit ?? "∞"}
              </td>
              <td>
                <Link href={`/demo/${demoSlug}/admin/promotions/${promotion.id}`}>Edit</Link>
              </td>
              <td>
                {promotion.status === "active" ? (
                  <form action={deactivatePromotionAction}>
                    <input type="hidden" name="id" value={promotion.id} />
                    <button type="submit">Deactivate</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
