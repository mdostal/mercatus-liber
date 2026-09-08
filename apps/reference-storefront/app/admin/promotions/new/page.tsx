import Link from "next/link";
import { createPromotionAction } from "../../../../lib/actions";
import { PromotionFormFields } from "../PromotionFormFields";

export const dynamic = "force-dynamic";

export default function NewPromotionPage() {
  return (
    <main>
      <p>
        <Link href="/admin/promotions">← Promotions</Link>
      </p>
      <h1>Admin: New promotion</h1>
      <form action={createPromotionAction}>
        <PromotionFormFields />
        <p>
          <button type="submit">Create promotion</button>
        </p>
      </form>
    </main>
  );
}
