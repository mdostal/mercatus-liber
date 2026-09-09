import Link from "next/link";
import { createBundleAction } from "../../../../../../lib/actions";
import { BundleFormFields } from "../BundleFormFields";

export const dynamic = "force-dynamic";

export default async function NewBundlePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/bundles`}>← Bundles</Link>
      </p>
      <h1>Admin: New bundle</h1>
      <form action={createBundleAction}>
        <BundleFormFields />
        <p>
          <button type="submit">Create bundle</button>
        </p>
      </form>
    </main>
  );
}
