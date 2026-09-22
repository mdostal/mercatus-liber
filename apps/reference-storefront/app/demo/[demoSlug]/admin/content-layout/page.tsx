import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { setPageTemplateAction, updateCmsPageAction } from "../../../../../lib/actions";
import { getContentLayoutStatus } from "../../../../../lib/content-layout-status";
import { getServicesForDemo } from "../../../../../lib/services";
import { readActiveThemeBundle } from "../../../../../lib/theme-cookie";
import { CmsSectionFields } from "../cms/CmsSectionFields";

export const dynamic = "force-dynamic";

/**
 * scc-04: the first real connection between packages/theming's LayoutTemplate/
 * ThemingService system and packages/cms's Page/ComponentInstance system --
 * previously completely disconnected (theming only had the whole-bundle
 * picker at /themes, cms only had its own admin/cms pages, and no admin
 * surface tied the two together at all).
 *
 * Two independent things happen on this one page, deliberately kept additive
 * rather than replacing anything that existed before:
 *
 * 1. A status row per LayoutTemplate page type (nav/home/category/cart/pdp --
 *    the same 5 page types packages/theming/src/service.ts's DEFAULT_TEMPLATES
 *    registers, see lib/content-layout-status.ts), each with a real picker
 *    that calls setPageTemplateAction (lib/actions.ts) -> ThemingService
 *    .setDefaultTemplate for JUST that page type -- independent of, and
 *    composing on top of, the existing whole-bundle picker at /themes
 *    (applyThemeAction), which keeps working completely unchanged. See
 *    lib/resolve-page-template.ts for exactly how the two compose at render
 *    time (an admin's per-page-type pick here wins over the active bundle's
 *    own pick for that one page type; a page type with no override here
 *    still follows the active bundle exactly as before this story).
 * 2. The "home" page type's real CMS page (the one page type with a single,
 *    unambiguous CMS page per demo -- "home-<demoSlug>", same slug
 *    convention app/demo/[demoSlug]/page.tsx's own DemoHomePage uses)
 *    rendered inline via scc-03's schema-typed CmsSectionFields editor,
 *    submitting to the exact same updateCmsPageAction the standalone
 *    admin/cms/[id] edit page uses -- so content AND layout are editable
 *    from one dashboard, per this story's whole point. Category/PDP pages
 *    aren't shown inline here: each demo has many of them (one per
 *    category/product, not one canonical page), so there's no single page
 *    to embed without a page-picker this story doesn't ask for -- an admin
 *    edits those via the existing admin/cms pages, same as today.
 */
export default async function AdminContentLayoutPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { theming, cms, catalog, marketingCatalog } = await getServicesForDemo(demoSlug);
  const activeTheme = await readActiveThemeBundle(demoSlug);
  const rows = getContentLayoutStatus(theming, activeTheme);

  const homeSlug = `home-${demoSlug}`;
  const homePage = await cms.getPageBySlug(homeSlug);
  const componentTypes = cms.components.list();
  const [categories, products] = await Promise.all([marketingCatalog.listCategories({ demoSlug }), catalog.listProducts()]);
  const categoryOptions = categories.map((c) => ({ value: c.slug, label: `${c.title} (${c.slug})` }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.title} (${p.slug})` }));

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Content &amp; Layout</h1>
      <p style={{ color: "#666" }}>
        Connects <code>@mercatus-liber/theming</code>&apos;s per-page-type <code>LayoutTemplate</code> system to{" "}
        <code>@mercatus-liber/cms</code>&apos;s Page/section content -- pick a layout template independently for
        each page type below (additive on top of, never instead of, the whole-bundle picker at{" "}
        <Link href="/themes">/themes</Link>), and edit the home page&apos;s real CMS content inline underneath it.
      </p>

      <section>
        <h2>Layout templates by page type</h2>
        <table>
          <thead>
            <tr>
              <th>Page type</th>
              <th>Live on storefront now</th>
              <th>This dashboard&apos;s override</th>
              <th>Set template</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pageType}>
                <td>{row.label}</td>
                <td>
                  {row.liveTemplateLabel ?? <em style={{ color: "#666" }}>(no templates registered)</em>}
                  <br />
                  <small style={{ color: "#666" }}>{row.liveTemplateKey}</small>
                </td>
                <td>
                  {row.adminOverrideKey ?? (
                    <em style={{ color: "#666" }}>not set -- following the active theme bundle / default</em>
                  )}
                </td>
                <td>
                  {row.templates.length > 0 ? (
                    <form action={setPageTemplateAction}>
                      <input type="hidden" name="demoSlug" value={demoSlug} />
                      <input type="hidden" name="pageType" value={row.pageType} />
                      <select name="templateKey" defaultValue={row.liveTemplateKey ?? ""}>
                        {row.templates.map((t) => (
                          <option key={t.key} value={t.key} title={t.description}>
                            {t.label}
                          </option>
                        ))}
                      </select>{" "}
                      <button type="submit">Set</button>
                    </form>
                  ) : (
                    <em style={{ color: "#666" }}>No templates registered.</em>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Home page content</h2>
        {homePage ? (
          <form action={updateCmsPageAction}>
            <input type="hidden" name="demoSlug" value={demoSlug} />
            <input type="hidden" name="id" value={homePage.id} />
            <p>
              Slug: {homePage.slug} &middot; Status: {homePage.status}
            </p>
            <p>
              <label>
                Title
                <br />
                <input type="text" name="title" defaultValue={homePage.title} required />
              </label>
            </p>
            <CmsSectionFields
              componentTypes={componentTypes}
              sections={homePage.sections}
              categoryOptions={categoryOptions}
              productOptions={productOptions}
            />
            <p>
              <button type="submit">Save home page</button>
            </p>
          </form>
        ) : (
          <p>
            No CMS home page exists yet for this demo (expected slug &ldquo;{homeSlug}&rdquo;) -- create one via{" "}
            <Link href={`/demo/${demoSlug}/admin/cms/new`}>CMS pages</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
