import Link from "next/link";
import { getAdapterInfo } from "../../../../../lib/adapter-info";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  const rows = getAdapterInfo();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Settings</h1>
      <p style={{ color: "#666" }}>
        Which concrete adapter this running instance actually chose for each swappable
        subsystem, computed fresh from the current environment on every load.
      </p>

      <p>
        <Link href={`/demo/${demoSlug}/admin/settings/users`}>Manage admin users</Link>
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
              Subsystem
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
              Adapter
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
              Detail
            </th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subsystem}>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                {row.subsystem}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                {row.adapter}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                {row.detail}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                {row.status === "unconfigured" ? (
                  <strong>⚠ unconfigured</strong>
                ) : (
                  "active"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
