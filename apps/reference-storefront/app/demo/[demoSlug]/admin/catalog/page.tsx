import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug, listProductsForDemo } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminCatalogPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { catalog } = await getServicesForDemo(demoSlug);
  // commerce-gap-audit-3: scoped to this demo's own Catalog -- an unscoped
  // catalog.listProducts() showed every demo's products mixed together
  // under the shared Postgres backend (see lib/demos.ts's
  // listProductsForDemo doc comment).
  const products = await listProductsForDemo(catalog, demoSlug);

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Catalog</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.id}</td>
              <td>{product.title}</td>
              <td>{product.status}</td>
              <td>
                <Link href={`/demo/${demoSlug}/admin/products/${product.id}/skus`}>SKU matrix</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
