import Link from "next/link";
import { notFound } from "next/navigation";
import { isViewLive } from "@mercatus-liber/storefront-views";
import { isDemoSlug } from "../../../../../lib/demos";
import {
  archiveStorefrontViewAction,
  createStorefrontViewAction,
  publishStorefrontViewAction,
} from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";
import { StorefrontViewFormFields } from "./StorefrontViewFormFields";

export const dynamic = "force-dynamic";

/**
 * storefront-views-and-multi-catalog epic: the admin surface for this
 * store's curated storefront views -- structural template is
 * admin/promotions/page.tsx (a `<Link>` back to `/admin`, a `<table>` per
 * row with inline action forms), with an inline "+ New view" form at the
 * top instead of promotions' separate `/admin/promotions/new` subpage --
 * this view's create form has no fixed-slot repeated fields (unlike
 * bundles/campaigns/CMS pages), so one inline form is the faster-and-still-
 * correct option the story explicitly allows.
 */
export default async function AdminStorefrontViewsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { storefrontViews } = await getServicesForDemo(demoSlug);
  const views = await storefrontViews.listViews(demoSlug);

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Storefront views</h1>

      <h2>+ New view</h2>
      <form action={createStorefrontViewAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <StorefrontViewFormFields />
        <p>
          <button type="submit">Create view (draft)</button>
        </p>
      </form>

      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Name</th>
            <th>Default override</th>
            <th>Window</th>
            <th>Status</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {views.map((view) => (
            <tr key={view.id}>
              <td>
                {isViewLive(view) ? (
                  <Link href={`/demo/${demoSlug}/site/${view.slug}`}>{view.slug}</Link>
                ) : (
                  view.slug
                )}
              </td>
              <td>{view.name}</td>
              <td>{view.isDefaultOverride ? "yes" : "no"}</td>
              <td>{view.startsAt || view.endsAt ? `${view.startsAt ?? "…"} – ${view.endsAt ?? "…"}` : "always"}</td>
              <td>{view.status}</td>
              <td>
                <Link href={`/demo/${demoSlug}/admin/storefront-views/${view.id}`}>Edit</Link>
              </td>
              <td>
                {view.status === "draft" ? (
                  <form action={publishStorefrontViewAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={view.id} />
                    <button type="submit">Publish</button>
                  </form>
                ) : null}
                {view.status === "active" ? (
                  <form action={archiveStorefrontViewAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={view.id} />
                    <button type="submit">Archive</button>
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
