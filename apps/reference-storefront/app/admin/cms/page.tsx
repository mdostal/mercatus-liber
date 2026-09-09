import Link from "next/link";
import { publishCmsPageAction } from "../../../lib/actions";
import { getServicesForDemo } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminCmsPage() {
  const { cms } = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move
  const pages = await cms.listPages();

  return (
    <main>
      <p>
        <Link href="/admin">← Admin</Link>
      </p>
      <h1>Admin: CMS Pages</h1>
      <p>
        <Link href="/admin/cms/new">+ New page</Link>
        {" | "}
        <Link href="/admin/cms/marketing/new">+ New marketing page</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td>{page.id}</td>
              <td>{page.title}</td>
              <td>{page.pageType}</td>
              <td>{page.status}</td>
              <td>
                <Link href={`/admin/cms/${page.id}`}>Edit</Link>
              </td>
              <td>
                {page.status === "draft" ? (
                  <form action={publishCmsPageAction}>
                    <input type="hidden" name="id" value={page.id} />
                    <button type="submit">Publish</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
