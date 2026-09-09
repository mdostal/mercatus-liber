import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { publishCmsPageAction, updateCmsPageAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { CmsSectionFields } from "../CmsSectionFields";

export const dynamic = "force-dynamic";

/**
 * pageType and slug are NOT editable here -- CmsService.updatePage's own
 * type signature only accepts a Partial<Pick<Page, "title" | "sections">>
 * patch (see packages/cms/src/service.ts), so this form only ever touches
 * title and sections, matching that contract rather than working around it.
 */
export default async function EditCmsPagePage({ params }: { params: Promise<{ demoSlug: string; id: string }> }) {
  const { demoSlug, id } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { cms } = await getServicesForDemo(demoSlug);
  const page = await cms.getPage(id);
  if (!page) notFound();
  const componentTypes = cms.components.list();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/cms`}>← CMS Pages</Link>
      </p>
      <h1>Admin: Edit page</h1>
      <p>
        Type: {page.pageType} &middot; Slug: {page.slug} &middot; Status: {page.status}
      </p>
      <form action={updateCmsPageAction}>
        <input type="hidden" name="id" value={page.id} />
        <p>
          <label>
            Title
            <br />
            <input type="text" name="title" defaultValue={page.title} required />
          </label>
        </p>
        <CmsSectionFields componentTypes={componentTypes} sections={page.sections} />
        <p>
          <button type="submit">Save page</button>
        </p>
      </form>
      {page.status === "draft" ? (
        <form action={publishCmsPageAction}>
          <input type="hidden" name="id" value={page.id} />
          <button type="submit">Publish</button>
        </form>
      ) : null}
    </main>
  );
}
