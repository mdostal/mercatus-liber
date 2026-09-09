import Link from "next/link";
import { deactivatePromotionAction } from "../../../lib/actions";
import { getServicesForDemo } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const { promotions } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const allPromotions = await promotions.listPromotions();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: Promotions</h1>
      <p>
        <Link href="/admin/promotions/new">+ New promotion</Link>
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
                <Link href={`/admin/promotions/${promotion.id}`}>Edit</Link>
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
