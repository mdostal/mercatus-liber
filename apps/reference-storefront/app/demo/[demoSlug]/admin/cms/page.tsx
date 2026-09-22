import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { publishCmsPageAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminCmsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { cms } = await getServicesForDemo(demoSlug);
  // Same real cross-demo-bleed bug as buildNavLinks (app/demo/[demoSlug]/
  // layout.tsx) in a different place: under the shared Sanity backend, an
  // unscoped listPages() here showed all 3 demos' CMS pages mixed together
  // in one admin's page list. Scoped to this admin's own demo, same fix.
  const pages = await cms.listPages({ demoSlug });

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: CMS Pages</h1>
      <p>
        <Link href={`/demo/${demoSlug}/admin/cms/new`}>+ New page</Link>
        {" | "}
        <Link href={`/demo/${demoSlug}/admin/cms/marketing/new`}>+ New marketing page</Link>
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
                <Link href={`/demo/${demoSlug}/admin/cms/${page.id}`}>Edit</Link>
              </td>
              <td>
                {page.status === "draft" ? (
                  <form action={publishCmsPageAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
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
