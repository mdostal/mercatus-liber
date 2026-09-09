import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { deactivateBundleAction, updateBundleAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { BundleFormFields } from "../BundleFormFields";

export const dynamic = "force-dynamic";

export default async function EditBundlePage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { bundles } = await getServicesForDemo(demoSlug);
  const bundle = await bundles.getBundle(id);
  if (!bundle) notFound();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/bundles`}>← Bundles</Link>
      </p>
      <h1>Admin: Edit bundle</h1>
      <form action={updateBundleAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="id" value={bundle.id} />
        <BundleFormFields bundle={bundle} />
        <p>
          <button type="submit">Save bundle</button>
        </p>
      </form>
      {bundle.status === "active" ? (
        <form action={deactivateBundleAction}>
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <input type="hidden" name="id" value={bundle.id} />
          <button type="submit">Deactivate</button>
        </form>
      ) : null}
    </main>
  );
}
