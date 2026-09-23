import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { deactivateRecommendationRuleAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminRecommendationsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { recommendations, catalog } = await getServicesForDemo(demoSlug);
  // commerce-gap-audit-3 finding 13: scoped to this demo's own rules --
  // before this fix, this page listed every demo's recommendation rules
  // combined (see RecommendationRule.demoSlug's doc comment).
  const allRules = await recommendations.listRules({ demoSlug });

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Recommendations</h1>
      <p>
        <Link href={`/demo/${demoSlug}/admin/recommendations/new`}>+ New rule</Link>
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
                    <Link href={`/demo/${demoSlug}/admin/recommendations/${rule.id}`}>Edit</Link>
                  </td>
                  <td>
                    {rule.status === "active" ? (
                      <form action={deactivateRecommendationRuleAction}>
                        <input type="hidden" name="demoSlug" value={demoSlug} />
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
