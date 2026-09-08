import Link from "next/link";
import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminCmsPage() {
  const { cms } = await getServices();
  const pages = await cms.listPages();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: CMS Pages</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td>{page.id}</td>
              <td>{page.title}</td>
              <td>{page.pageType}</td>
              <td>{page.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
