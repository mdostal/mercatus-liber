import { getServices } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function AdminPluginsPage() {
  const { plugins, orderNotificationPlugin } = await getServices();
  const registered = plugins.list();
  const notifications = orderNotificationPlugin.listNotifications();

  return (
    <main>
      <h1>Admin: Plugins</h1>
      <p style={{ color: "#666" }}>
        First page under /admin -- the natural landing spot for later admin-view work (see
        docs/subsystems/12-plugins-extensibility.md and the project epic backlog's
        admin-janus-dogfood epic).
      </p>

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
