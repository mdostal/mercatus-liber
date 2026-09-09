import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminPluginsPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { plugins, orderNotificationPlugin } = await getServicesForDemo(demoSlug);
  const registered = plugins.list();
  const notifications = orderNotificationPlugin.listNotifications();

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Plugins</h1>

      <h2>Registered plugins</h2>
      <ul>
        {registered.map((plugin) => (
          <li key={plugin.name}>{plugin.name}</li>
        ))}
      </ul>

      <h2>Recent order notifications</h2>
      {notifications.length === 0 ? (
        <p>No notifications yet -- place a demo order to see one here.</p>
      ) : (
        <ul>
          {notifications.map((n, i) => (
            <li key={i}>
              {n.message} -- {n.at}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
