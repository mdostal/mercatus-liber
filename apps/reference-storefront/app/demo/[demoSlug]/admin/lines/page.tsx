import Link from "next/link";
import { notFound } from "next/navigation";
import { SaleWindow } from "@mercatus-liber/storefront-ui";
import { LineFormFields } from "../../../../../components/line-form";
import { isDemoSlug } from "../../../../../lib/demos";
import { createLineAction } from "../../../../../lib/line-actions";
import { listLinesForDemo } from "../../../../../lib/lines";
import { getServicesForDemo } from "../../../../../lib/services";
import { STORE_TIME_ZONE } from "../../../../../lib/store-time";

export const dynamic = "force-dynamic";

export default async function AdminLinesPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { catalog, bi } = await getServicesForDemo(demoSlug);
  const now = new Date();
  const [lines, sales] = await Promise.all([listLinesForDemo(catalog, demoSlug, now, { includeDrafts: true }), bi.getSalesByCollection()]);
  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Lines</h1>
      <p style={{ maxWidth: "65ch" }}>Lines are named, scheduled sets of products with their own page. Drafts are listed here only.</p>
      <table data-admin-lines>
        <thead>
          <tr>
            <th>Line</th>
            <th>When</th>
            <th>Sold in its window</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ line, lifecycle }) => {
            const sold = sales.find((s) => s.collectionId === line.id);
            return (
              <tr key={line.id}>
                <td>
                  <Link href={`/demo/${demoSlug}/admin/lines/${line.id}`}>{line.name}</Link> · <Link href={`/demo/${demoSlug}/lines/${line.slug}`}>page</Link>
                </td>
                <td>{lifecycle.state === "inactive" ? "Draft" : lifecycle.state === "active" && !lifecycle.endsAt ? "Open" : <SaleWindow lifecycle={lifecycle} now={now.toISOString()} timeZone={STORE_TIME_ZONE} />}</td>
                <td>{sold ? `${sold.orders} orders, ${sold.unitsSold} units, $${(sold.revenue.amount / 100).toFixed(2)}` : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>New line</h2>
      <form action={createLineAction}>
        <LineFormFields demoSlug={demoSlug} timeZone={STORE_TIME_ZONE} />
        <button type="submit">Create line</button>
      </form>
    </main>
  );
}
