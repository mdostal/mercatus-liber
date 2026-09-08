import Link from "next/link";
import { deactivateBundleAction } from "../../../lib/actions";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminBundlesPage() {
  const { bundles, catalog } = await getServices();
  const allBundles = await bundles.listBundles();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: Bundles</h1>
      <p>
        <Link href="/admin/bundles/new">+ New bundle</Link>
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
                    <Link href={`/admin/bundles/${bundle.id}`}>Edit</Link>
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
