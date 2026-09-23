import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { archiveStorefrontViewAction, publishStorefrontViewAction, updateStorefrontViewAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { StorefrontViewFormFields } from "../StorefrontViewFormFields";

export const dynamic = "force-dynamic";

/**
 * gap-audit-3-storefront-view-edit: the previously-missing edit UI for
 * StorefrontViewsService.updateView (see audit-findings.md §7 -- a real,
 * exported service method with zero call site and zero test coverage
 * before this fix; an admin could create, publish, or archive a view but
 * never edit one after creation). Same "[id]/page.tsx is the edit page"
 * routing convention as admin/promotions/[id]/page.tsx,
 * admin/bundles/[id]/page.tsx, admin/cms/[id]/page.tsx, and
 * admin/advertising/[id]/page.tsx -- not a separate "/edit" subpath, since
 * every sibling admin-CRUD surface in this repo already resolves the edit
 * page at the bare `[id]` route.
 */
export default async function EditStorefrontViewPage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { storefrontViews } = await getServicesForDemo(demoSlug);
  const view = await storefrontViews.getView(id);
  if (!view || view.demoSlug !== demoSlug) notFound();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/storefront-views`}>← Storefront views</Link>
      </p>
      <h1>Admin: Edit storefront view</h1>
      <form action={updateStorefrontViewAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
        <input type="hidden" name="id" value={view.id} />
        <StorefrontViewFormFields view={view} />
        <p>
          <button type="submit">Save view</button>
        </p>
      </form>
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
    </main>
  );
}
