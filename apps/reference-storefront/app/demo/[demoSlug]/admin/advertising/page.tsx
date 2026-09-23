import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoSlug } from "../../../../../lib/demos";
import { deactivateCampaignAction } from "../../../../../lib/actions";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

/** "Sep 8, 2026, 12:00 AM" style, or a fallback when a bound is unset. */
function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  const start = startsAt ? new Date(startsAt).toLocaleString() : "any time";
  const end = endsAt ? new Date(endsAt).toLocaleString() : "no expiry";
  return `${start} – ${end}`;
}

function formatTargeting(serviceAreaId: string | null, pageSlug: string | null): string {
  if (serviceAreaId === null && pageSlug === null) return "untargeted";
  const parts: string[] = [];
  if (serviceAreaId !== null) parts.push(`service area: ${serviceAreaId}`);
  if (pageSlug !== null) parts.push(`page: ${pageSlug}`);
  return parts.join(", ");
}

export default async function AdminAdvertisingPage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { advertising } = await getServicesForDemo(demoSlug);
  // commerce-gap-audit-3: scoped to this demo's own campaigns, matching the
  // same demo-scoping fix already applied to /admin/cms (epic 60) and
  // categories (epic 61) -- an unscoped list() showed every demo's
  // campaigns mixed together under the shared Postgres backend.
  const campaigns = await advertising.listCampaigns({ demoSlug });

  return (
    <main>
      <p>
        <Link href={`/demo/${demoSlug}/admin`}>← Admin</Link>
      </p>
      <h1>Admin: Advertising</h1>
      <p>
        <Link href={`/demo/${demoSlug}/admin/advertising/new`}>+ New campaign</Link>
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Date range</th>
            <th>Targeting</th>
            <th>Creatives</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td>{campaign.name}</td>
              <td>{campaign.status}</td>
              <td>{formatDateRange(campaign.startsAt, campaign.endsAt)}</td>
              <td>{formatTargeting(campaign.targeting.serviceAreaId, campaign.targeting.pageSlug)}</td>
              <td>{campaign.creatives.length}</td>
              <td>
                <Link href={`/demo/${demoSlug}/admin/advertising/${campaign.id}`}>Edit</Link>
              </td>
              <td>
                {campaign.status === "active" ? (
                  <form action={deactivateCampaignAction}>
                    <input type="hidden" name="demoSlug" value={demoSlug} />
                    <input type="hidden" name="id" value={campaign.id} />
                    <button type="submit">Deactivate</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
