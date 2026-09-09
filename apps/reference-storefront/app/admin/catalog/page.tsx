import Link from "next/link";
import { getServicesForDemo } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminCatalogPage() {
  const { catalog } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const products = await catalog.listProducts();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: Catalog</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.id}</td>
              <td>{product.title}</td>
              <td>{product.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
