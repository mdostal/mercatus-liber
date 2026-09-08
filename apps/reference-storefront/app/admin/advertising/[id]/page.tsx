import Link from "next/link";
import { notFound } from "next/navigation";
import { deactivateCampaignAction, updateCampaignAction } from "../../../../lib/actions";
import { getServices } from "../../../../lib/services";
import { CampaignFormFields } from "../CampaignFormFields";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { advertising } = await getServices();
  const campaign = await advertising.getCampaign(id);
  if (!campaign) notFound();

  return (
    <main>
      <p>
        <Link href="/admin/advertising">← Advertising</Link>
      </p>
      <h1>Admin: Edit campaign</h1>
      <form action={updateCampaignAction}>
        <input type="hidden" name="id" value={campaign.id} />
        <CampaignFormFields campaign={campaign} />
        <p>
          <button type="submit">Save campaign</button>
        </p>
      </form>
      {campaign.status === "active" ? (
        <form action={deactivateCampaignAction}>
          <input type="hidden" name="id" value={campaign.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
