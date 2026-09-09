import Link from "next/link";
import { createCmsPageAction } from "../../../../lib/actions";
import { getServices } from "../../../../lib/services";
import { CmsSectionFields } from "../CmsSectionFields";

export const dynamic = "force-dynamic";

/** The non-"marketing" PageType values -- marketing pages get their own create form (see marketing/new/page.tsx and design-discussion.md §3). */
const PAGE_TYPES = ["home", "category", "search", "pdp", "location"] as const;

export default async function NewCmsPagePage() {
  const { cms } = await getServices();
  const componentTypes = cms.components.list();

  return (
    <main>
      <p>
        <Link href="/admin/cms">← CMS Pages</Link>
      </p>
      <h1>Admin: New page</h1>
      <form action={createCmsPageAction}>
        <p>
          <label>
            Page type
            <br />
            <select name="pageType" defaultValue="category">
              {PAGE_TYPES.map((pageType) => (
                <option key={pageType} value={pageType}>
                  {pageType}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          <label>
            Slug
            <br />
            <input type="text" name="slug" required />
          </label>
        </p>
        <p>
          <label>
            Title
            <br />
            <input type="text" name="title" required />
          </label>
        </p>
        <CmsSectionFields componentTypes={componentTypes} />
        <p>
          <button type="submit">Create page</button>
        </p>
      </form>
    </main>
  );
}
