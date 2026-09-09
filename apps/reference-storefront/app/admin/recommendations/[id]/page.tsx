import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deactivateRecommendationRuleAction,
  updateRecommendationRuleAction,
} from "../../../../lib/actions";
import { getServicesForDemo } from "../../../../lib/services";
import { RecommendationFormFields } from "../RecommendationFormFields";

export const dynamic = "force-dynamic";

export default async function EditRecommendationRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { recommendations } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const rule = await recommendations.getRule(id);
  if (!rule) notFound();

  return (
    <main>
      <p>
        <Link href="/admin/recommendations">← Recommendations</Link>
      </p>
      <h1>Admin: Edit recommendation rule</h1>
      <form action={updateRecommendationRuleAction}>
        <input type="hidden" name="id" value={rule.id} />
        <RecommendationFormFields rule={rule} />
        <p>
          <button type="submit">Save rule</button>
        </p>
      </form>
      {rule.status === "active" ? (
        <form action={deactivateRecommendationRuleAction}>
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
