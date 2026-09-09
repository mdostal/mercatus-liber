import Link from "next/link";
import { createMarketingPageAction } from "../../../../../lib/actions";
import { getServices } from "../../../../../lib/services";
import { CmsSectionFields } from "../../CmsSectionFields";

export const dynamic = "force-dynamic";

/**
 * A separate create form from the plain-page one (new/page.tsx), since
 * createMarketingPage's input shape (campaignName/startDate/endDate/
 * productIds) is genuinely different from a plain page's -- see
 * design-discussion.md §3. pageType is implicitly "marketing" here, so
 * there's no pageType field at all.
 */
export default async function NewMarketingCmsPagePage() {
  const { cms } = await getServices();
  const componentTypes = cms.components.list();

  return (
    <main>
      <p>
        <Link href="/admin/cms">← CMS Pages</Link>
      </p>
      <h1>Admin: New marketing page</h1>
      <form action={createMarketingPageAction}>
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
        <p>
          <label>
            Campaign name
            <br />
            <input type="text" name="campaignName" required />
          </label>
        </p>
        <p>
          <label>
            Start date
            <br />
            <input type="date" name="startDate" required />
          </label>
        </p>
        <p>
          <label>
            End date (optional)
            <br />
            <input type="date" name="endDate" />
          </label>
        </p>
        <p>
          <label>
            Product ids (comma-separated)
            <br />
            <input type="text" name="productIds" />
          </label>
        </p>
        <CmsSectionFields componentTypes={componentTypes} />
        <p>
          <button type="submit">Create marketing page</button>
        </p>
      </form>
    </main>
  );
}
