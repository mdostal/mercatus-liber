import Link from "next/link";
import { createCampaignAction } from "../../../../lib/actions";
import { CampaignFormFields } from "../CampaignFormFields";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <main>
      <p>
        <Link href="/admin/advertising">← Advertising</Link>
      </p>
      <h1>Admin: New campaign</h1>
      <form action={createCampaignAction}>
        <CampaignFormFields />
        <p>
          <button type="submit">Create campaign</button>
        </p>
      </form>
    </main>
  );
}
