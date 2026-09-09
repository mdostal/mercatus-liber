import Link from "next/link";
import { createPromotionAction } from "../../../../../../lib/actions";
import { PromotionFormFields } from "../PromotionFormFields";

export const dynamic = "force-dynamic";

export default async function NewPromotionPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/promotions`}>← Promotions</Link>
      </p>
      <h1>Admin: New promotion</h1>
      <form action={createPromotionAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <PromotionFormFields />
        <p>
          <button type="submit">Create promotion</button>
        </p>
      </form>
    </main>
  );
}
