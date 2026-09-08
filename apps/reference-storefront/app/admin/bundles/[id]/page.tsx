import Link from "next/link";
import { notFound } from "next/navigation";
import { deactivateBundleAction, updateBundleAction } from "../../../../lib/actions";
import { getServices } from "../../../../lib/services";
import { BundleFormFields } from "../BundleFormFields";

export const dynamic = "force-dynamic";

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bundles } = await getServices();
  const bundle = await bundles.getBundle(id);
  if (!bundle) notFound();

  return (
    <main>
      <p>
        <Link href="/admin/bundles">← Bundles</Link>
      </p>
      <h1>Admin: Edit bundle</h1>
      <form action={updateBundleAction}>
        <input type="hidden" name="id" value={bundle.id} />
        <BundleFormFields bundle={bundle} />
        <p>
          <button type="submit">Save bundle</button>
        </p>
      </form>
      {bundle.status === "active" ? (
        <form action={deactivateBundleAction}>
          <input type="hidden" name="id" value={bundle.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
