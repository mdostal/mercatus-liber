import Link from "next/link";
import { createRecommendationRuleAction } from "../../../../../../lib/actions";
import { RecommendationFormFields } from "../RecommendationFormFields";

export const dynamic = "force-dynamic";

export default async function NewRecommendationRulePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/recommendations`}>← Recommendations</Link>
      </p>
      <h1>Admin: New recommendation rule</h1>
      <form action={createRecommendationRuleAction}>
        <RecommendationFormFields />
        <p>
          <button type="submit">Create rule</button>
        </p>
      </form>
    </main>
  );
}
