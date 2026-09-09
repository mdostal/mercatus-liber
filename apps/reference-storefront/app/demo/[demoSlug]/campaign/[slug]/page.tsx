import { notFound } from "next/navigation";
import { CmsSection } from "../../../../../components/cms-sections";
import { InteractionTracker } from "../../../../../components/interaction-tracker";
import { isDemoSlug } from "../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ demoSlug: string; slug: string }> }) {
  const { demoSlug, slug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();
  const { cms } = await getServicesForDemo(demoSlug);
  const page = await cms.getPageBySlug(slug);
  if (!page || page.pageType !== "marketing") notFound();

  const meta = await cms.getMarketingPageMeta(page.id);

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug }} />
      <h1>{page.title}</h1>
      {meta && (
        <p style={{ color: "#666" }}>
          {meta.campaignName} -- {meta.startDate}
          {meta.endDate ? ` to ${meta.endDate}` : " (ongoing)"}
        </p>
      )}
      {page.sections.map((section, i) => (
        <CmsSection key={i} demoSlug={demoSlug} section={section} pageSlug={slug} />
      ))}
    </main>
  );
}
