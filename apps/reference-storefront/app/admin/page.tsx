import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main>
      <h1>Admin</h1>
      <p style={{ color: "#666" }}>
        Hand-built admin surface (see .pHive/epics/admin-janus-dogfood/docs/janus-dogfood-attempt.md
        for why this isn't a Janus-composed view yet).
      </p>
      <ul>
        <li>
          <Link href="/admin/catalog">Catalog</Link>
        </li>
        <li>
          <Link href="/admin/cms">CMS pages</Link>
        </li>
        <li>
          <Link href="/admin/orders">Orders</Link>
        </li>
        <li>
          <Link href="/admin/plugins">Plugins</Link>
        </li>
        <li>
          <Link href="/admin/promotions">Promotions</Link>
        </li>
      </ul>
    </main>
  );
}
