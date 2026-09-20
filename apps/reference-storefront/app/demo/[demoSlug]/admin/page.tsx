import Link from "next/link";

export default async function AdminHomePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  const adminBase = `/demo/${demoSlug}/admin`;

  return (
    <main>
      <h1>Admin</h1>
      <p style={{ color: "#666" }}>
        Hand-built admin surface (see .pHive/epics/admin-janus-dogfood/docs/janus-dogfood-attempt.md
        for why this isn't a Janus-composed view yet).
      </p>
      <ul>
        <li>
          <Link href={`${adminBase}/catalog`}>Catalog</Link>
        </li>
        <li>
          <Link href={`${adminBase}/cms`}>CMS pages</Link>
        </li>
        <li>
          <Link href={`${adminBase}/content-layout`}>Content & Layout</Link>
        </li>
        <li>
          <Link href={`${adminBase}/copilot`}>AI Content Copilot</Link>
        </li>
        <li>
          <Link href={`${adminBase}/orders`}>Orders</Link>
        </li>
        <li>
          <Link href={`${adminBase}/metrics`}>Metrics</Link>
        </li>
        <li>
          <Link href={`${adminBase}/plugins`}>Plugins</Link>
        </li>
        <li>
          <Link href={`${adminBase}/promotions`}>Promotions</Link>
        </li>
        <li>
          <Link href={`${adminBase}/storefront-views`}>Storefront Views</Link>
        </li>
        <li>
          <Link href={`${adminBase}/reviews`}>Reviews</Link>
        </li>
        <li>
          <Link href={`${adminBase}/bundles`}>Bundles</Link>
        </li>
        <li>
          <Link href={`${adminBase}/recommendations`}>Recommendations</Link>
        </li>
        <li>
          <Link href={`${adminBase}/advertising`}>Advertising</Link>
        </li>
        <li>
          <Link href={`${adminBase}/settings`}>Settings</Link>
        </li>
      </ul>
    </main>
  );
}
