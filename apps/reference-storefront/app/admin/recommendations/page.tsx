import Link from "next/link";
import { deactivateRecommendationRuleAction } from "../../../lib/actions";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminRecommendationsPage() {
  const { recommendations, catalog } = await getServices();
  const allRules = await recommendations.listRules();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: Recommendations</h1>
      <p>
        <Link href="/admin/recommendations/new">+ New rule</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Source product</th>
            <th>Label</th>
            <th>Placement</th>
            <th>Targets</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {await Promise.all(
            allRules.map(async (rule) => {
              const product = await catalog.getProduct(rule.sourceProductId);
              return (
                <tr key={rule.id}>
                  <td>{product?.title ?? rule.sourceProductId}</td>
                  <td>{rule.label}</td>
                  <td>{rule.placement}</td>
                  <td>{rule.targetProductIds.length}</td>
                  <td>{rule.status}</td>
                  <td>
                    <Link href={`/admin/recommendations/${rule.id}`}>Edit</Link>
                  </td>
                  <td>
                    {rule.status === "active" ? (
                      <form action={deactivateRecommendationRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button type="submit">Deactivate</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </main>
  );
}
