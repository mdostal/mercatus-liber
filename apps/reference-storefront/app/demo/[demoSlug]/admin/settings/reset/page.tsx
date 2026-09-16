import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { resetDemoDataAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";

export const dynamic = "force-dynamic";

/**
 * data-reset-and-safety epic: follows admin/settings/users/page.tsx's EXACT
 * convention for an owner-only admin page -- a page-level
 * `getCurrentSession()` check (the FIRST of two independent owner-only
 * gates, mirroring admin-auth-04's own precedent; resetDemoDataAction's own
 * `requireAdminPermission(demoSlug, "reset_demo_data")` call is the second,
 * server-action-level gate a hidden page alone is never a substitute for).
 *
 * The confirmation form requires the visitor to actually TYPE this demo's
 * own slug into a real text input (GitHub's "type the repo name to delete"
 * precedent, per this epic's design doc) -- never a bare confirm button --
 * before resetDemoDataAction will do anything.
 */
export default async function AdminResetDemoDataPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { adminAuth } = await getServicesForDemo(demoSlug);
  const session = await adminAuth.getCurrentSession();

  if (!session || session.role !== "owner") {
    return (
      <main>
        <p>
          <Link href={`/demo/${demoSlug}/admin/settings`}>← Settings</Link>
        </p>
        <h1>Admin: Reset demo data</h1>
        <p>Owner access required.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/settings`}>← Settings</Link>
      </p>
      <h1>Admin: Reset demo data</h1>

      <div style={{ border: "2px solid #c00", padding: "12px 16px", maxWidth: 640 }}>
        <p style={{ fontWeight: "bold", color: "#c00" }}>
          This permanently and irreversibly deletes this demo&apos;s own real data --
          carts, orders, customer profiles, reviews, promotions, bundles, recommendations,
          advertising campaigns, service areas, storefront views, fulfillment routing, and
          the catalog itself (products, SKUs, categories) -- then re-seeds this one demo
          back to its canonical seed data on the next visit.
        </p>
        <p>
          Only this demo (<code>{demoSlug}</code>) is affected. The other two demo stores
          share this same database but are never touched by this action -- every delete is
          scoped to this demo&apos;s own rows only. A small number of rows that this
          database schema cannot yet unambiguously attribute to one demo (e.g. certain
          whole-cart promotions and campaigns with no product/service-area targeting) are
          deliberately left untouched rather than risked -- see this action&apos;s own code
          comments for the full, honest list.
        </p>
        <p>This cannot be undone.</p>

        <form action={resetDemoDataAction}>
          <input type="hidden" name="demoSlug" value={demoSlug} />
          <p>
            <label htmlFor="confirmSlug">
              Type <strong>{demoSlug}</strong> to confirm:
            </label>
          </p>
          <p>
            <input
              type="text"
              id="confirmSlug"
              name="confirmSlug"
              placeholder={demoSlug}
              autoComplete="off"
              required
            />
          </p>
          <button type="submit">Permanently reset {demoSlug}</button>
        </form>
      </div>
    </main>
  );
}
