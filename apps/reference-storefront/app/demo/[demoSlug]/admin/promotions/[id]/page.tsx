import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { deactivatePromotionAction, updatePromotionAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { PromotionFormFields } from "../PromotionFormFields";

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { promotions } = await getServicesForDemo(demoSlug);
  const promotion = await promotions.getPromotion(id);
  if (!promotion) notFound();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/promotions`}>← Promotions</Link>
      </p>
      <h1>Admin: Edit promotion</h1>
      <form action={updatePromotionAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="id" value={promotion.id} />
        <PromotionFormFields promotion={promotion} />
        <p>
          <button type="submit">Save promotion</button>
        </p>
      </form>
      {promotion.status === "active" ? (
        <form action={deactivatePromotionAction}>
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <input type="hidden" name="id" value={promotion.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
