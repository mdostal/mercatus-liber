import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { deactivateBundleAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminBundlesPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { bundles, catalog } = await getServicesForDemo(demoSlug);
  const allBundles = await bundles.listBundles();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Bundles</h1>
      <p>
        <Link href={`/demo/${demoSlug}/admin/bundles/new`}>+ New bundle</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Base product</th>
            <th>Title</th>
            <th>Tiers</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {await Promise.all(
            allBundles.map(async (bundle) => {
              const product = await catalog.getProduct(bundle.productId);
              return (
                <tr key={bundle.id}>
                  <td>{product?.title ?? bundle.productId}</td>
                  <td>{bundle.title}</td>
                  <td>{bundle.tiers.length}</td>
                  <td>{bundle.status}</td>
                  <td>
                    <Link href={`/demo/${demoSlug}/admin/bundles/${bundle.id}`}>Edit</Link>
                  </td>
                  <td>
                    {bundle.status === "active" ? (
                      <form action={deactivateBundleAction}>
                        <input type="hidden" name="id" value={bundle.id} />
                        <button type="submit">Deactivate</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </main>
  );
}
