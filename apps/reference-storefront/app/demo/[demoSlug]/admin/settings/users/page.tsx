import Link from "next/link";
import type { AdminRole } from "@mercatus-liber/admin-auth";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../../lib/demos";
import { updateAdminUserRoleAction } from "../../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../../lib/services";

export const dynamic = "force-dynamic";

/** The three AdminRole values, for the per-row role-change <select>. Kept local rather than derived at runtime, matching adapter-clerk's own VALID_ROLES convention. */
const ADMIN_ROLES: readonly AdminRole[] = ["owner", "admin", "viewer"];

/**
 * admin-auth-04: the one admin UI in this epic gated to "owner" only, not
 * "admin or owner" like every other mutation. This page-level check is the
 * FIRST of two independent owner-only gates (see updateAdminUserRoleAction's
 * own requireAdminPermission("manage_users") call in lib/actions.ts) -- a
 * hidden page alone is not a real access control, so a non-owner session
 * must be refused here too, not just at the server action.
 */
export default async function AdminUsersPage({ params }: { params: Promise<{ demoSlug: string }> }) {
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
        <h1>Admin: Manage users</h1>
        <p>Owner access required.</p>
      </main>
    );
  }

  const users = await adminAuth.listAdminUsers();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin/settings`}>← Settings</Link>
      </p>
      <h1>Admin: Manage users</h1>
      <table>
        <thead>
          <tr>
            <th>User ID</th>
            <th>Email</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.userId}>
              <td>{user.userId}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <form action={updateAdminUserRoleAction}>
                  <input type="hidden" name="demoSlug" value={demoSlug} />
                  <input type="hidden" name="userId" value={user.userId} />
                  <select name="role" defaultValue={user.role}>
                    {ADMIN_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Update role</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
