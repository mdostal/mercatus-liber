import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { createCmsPageAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";
import { CmsSectionFields } from "../CmsSectionFields";

export const dynamic = "force-dynamic";

/** The non-"marketing" PageType values -- marketing pages get their own create form (see marketing/new/page.tsx and design-discussion.md §3). */
const PAGE_TYPES = ["home", "category", "search", "pdp", "location"] as const;

export default async function NewCmsPagePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { cms, catalog, marketingCatalog } = await getServicesForDemo(demoSlug);
  const componentTypes = cms.components.list();
  const [categories, products] = await Promise.all([marketingCatalog.listCategories(), catalog.listProducts()]);
  const categoryOptions = categories.map((c) => ({ value: c.slug, label: `${c.title} (${c.slug})` }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.title} (${p.slug})` }));

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/cms`}>← CMS Pages</Link>
      </p>
      <h1>Admin: New page</h1>
      <form action={createCmsPageAction}>
        <input type="hidden" name="demoSlug" value={demoSlug} />
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
        <CmsSectionFields componentTypes={componentTypes} categoryOptions={categoryOptions} productOptions={productOptions} />
        <p>
          <button type="submit">Create page</button>
        </p>
      </form>
    </main>
  );
}
