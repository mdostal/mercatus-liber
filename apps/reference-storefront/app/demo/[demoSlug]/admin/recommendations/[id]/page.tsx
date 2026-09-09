import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import {
  deactivateRecommendationRuleAction,
  updateRecommendationRuleAction,
} from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { RecommendationFormFields } from "../RecommendationFormFields";

export const dynamic = "force-dynamic";

export default async function EditRecommendationRulePage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { recommendations } = await getServicesForDemo(demoSlug);
  const rule = await recommendations.getRule(id);
  if (!rule) notFound();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/recommendations`}>← Recommendations</Link>
      </p>
      <h1>Admin: Edit recommendation rule</h1>
      <form action={updateRecommendationRuleAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="id" value={rule.id} />
        <RecommendationFormFields rule={rule} />
        <p>
          <button type="submit">Save rule</button>
        </p>
      </form>
      {rule.status === "active" ? (
        <form action={deactivateRecommendationRuleAction}>
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
