import { notFound } from "next/navigation";
import { CmsSection } from "../../../components/cms-sections";
import { InteractionTracker } from "../../../components/interaction-tracker";
import { isDemoSlug } from "../../../lib/demos";
import { getServicesForDemo } from "../../../lib/services";

export const dynamic = "force-dynamic";

/**
 * demo-routing-05: this is the demo's own home page (CMS "home" page
 * content) -- moved here from the pre-move app/page.tsx, which is now the
 * demo-agnostic framework landing page (see app/(landing)/page.tsx) per
 * design-discussion.md §3. Uses the real `params.demoSlug` from the route,
 * same as every other page under this tree -- DEFAULT_DEMO_SLUG was only
 * ever a stand-in for routes that render outside `/demo/[demoSlug]/...`,
 * which this route no longer is.
 */
export default async function DemoHomePage({ params }: { params: Promise<{ demoSlug: string }> }) {
  const { demoSlug } = await params;
  if (!isDemoSlug(demoSlug)) notFound();

  const { cms } = await getServicesForDemo(demoSlug);
  const home = await cms.getPageBySlug("home");

  if (!home) {
    return (
      <main>
        <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
        <h1>Home</h1>
        <p>No home page configured yet.</p>
      </main>
    );
  }

  return (
    <main>
      <InteractionTracker eventName="page_viewed" properties={{ slug: "home" }} />
      {home.sections.map((section, i) => (
        // Sections are an ordered list, not individually id-addressable in this minimal demo -- index is a stable enough key here.
        <CmsSection key={i} demoSlug={demoSlug} section={section} pageSlug="home" />
      ))}
    </main>
  );
}
